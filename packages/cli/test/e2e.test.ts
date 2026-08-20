/**
 * End-to-end integration test.
 *
 * Assembles the pieces the way `synesthetica start` does — WS bridge,
 * engine handle from the bridge, MCP tool registry against that engine
 * — and verifies a full round trip:
 *
 *   MCP tool call → tool handler → WSBackedEngineHandle → WS → fake browser
 *     → browser replies with new state → tool result includes the state
 *
 * This is the Phase 1 success criterion: LLM tool calls change engine
 * state and the state comes back correctly.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { startWsBridge, type WsBridgeHandle } from "../src/engine/wsBridge.js";
import { buildToolRegistry } from "../src/tools/registry.js";
import { createPresetStore } from "../src/presets/presetStore.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ENGINE_BRIDGE_PROTOCOL,
  type BrowserToCli,
  type CliToBrowser,
  type EngineStateSnapshot,
} from "@synesthetica/contracts";

/** Fake browser: connects to the bridge and applies a tiny state machine. */
class FakeBrowser {
  private ws!: WebSocket;
  private state: EngineStateSnapshot;

  constructor(private port: number, private label: string) {
    this.state = {
      instance: label,
      macros: {},
      session: {
        tonic: null,
        mode: null,
        tempo: null,
        beatsPerBar: null,
        beatValue: null,
        chordMode: "harmonic",
        metronome: false,
      },
      input: null,
      activePreset: null,
    };
  }

  async connect(): Promise<void> {
    this.ws = new WebSocket(`ws://localhost:${this.port}`);
    await new Promise<void>((resolve, reject) => {
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
    const hello: BrowserToCli = {
      type: "hello",
      label: this.label,
      protocol: ENGINE_BRIDGE_PROTOCOL,
    };
    this.ws.send(JSON.stringify(hello));
    this.ws.on("message", (raw) => this.onMessage(raw));
    // Wait a tick so the bridge processes the hello.
    await new Promise((r) => setTimeout(r, 30));
  }

  private onMessage(raw: WebSocket.RawData): void {
    const msg = JSON.parse(String(raw)) as CliToBrowser;
    if (msg.type !== "call") return;
    // Apply the call to our fake state.
    switch (msg.method) {
      case "setTempo":
        this.state.session.tempo = msg.args[0] as number | null;
        break;
      case "setKey":
        this.state.session.tonic = msg.args[0] as number | null;
        this.state.session.mode = msg.args[1] as string | null;
        break;
      case "setMacro":
        this.state.macros[msg.args[0] as string] = msg.args[1] as number | string;
        break;
      case "setChordMode":
        this.state.session.chordMode = msg.args[0] as "harmonic" | "bass-led";
        break;
      case "setMetronome":
        this.state.session.metronome = msg.args[0] as boolean;
        break;
    }
    // Reply with the new state.
    const result: BrowserToCli = {
      type: "result",
      id: msg.id,
      ok: true,
      value: this.snapshot(),
    };
    this.ws.send(JSON.stringify(result));
    // Also fire a state-changed push so subscribers see it.
    const push: BrowserToCli = { type: "state-changed", snapshot: this.snapshot() };
    this.ws.send(JSON.stringify(push));
  }

  private snapshot(): EngineStateSnapshot {
    return {
      ...this.state,
      session: { ...this.state.session },
      macros: { ...this.state.macros },
    };
  }

  close(): void {
    this.ws.close();
  }
}

let bridge: WsBridgeHandle;
let browser: FakeBrowser;
let presetDir: string;

beforeEach(async () => {
  bridge = await startWsBridge({ port: 0, log: () => {} });
  browser = new FakeBrowser(bridge.port, "default");
  await browser.connect();
  presetDir = mkdtempSync(join(tmpdir(), "syn-e2e-presets-"));
});
afterEach(async () => {
  browser.close();
  await bridge.close();
  rmSync(presetDir, { recursive: true, force: true });
});

describe("E2E: MCP tool → WS bridge → fake browser → back", () => {
  it("set_tempo flows through and returns the new state", async () => {
    const engine = bridge.handleFor("default");
    const registry = buildToolRegistry(createPresetStore(presetDir));
    const setTempo = registry.get("set_tempo")!;
    const result = await setTempo.handle({ bpm: 120 }, engine);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.session.tempo).toBe(120);
    }
  });

  it("set_key flows through and returns the new state", async () => {
    const engine = bridge.handleFor("default");
    const registry = buildToolRegistry(createPresetStore(presetDir));
    const setKey = registry.get("set_key")!;
    const result = await setKey.handle({ root: 2, mode: "dorian" }, engine);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.session.tonic).toBe(2);
      expect(result.state.session.mode).toBe("dorian");
    }
  });

  it("set_macro flows through with the value", async () => {
    const engine = bridge.handleFor("default");
    const registry = buildToolRegistry(createPresetStore(presetDir));
    const setMacro = registry.get("set_macro")!;
    const result = await setMacro.handle(
      { name: "harmony:linger", value: 5 },
      engine,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.macros["harmony:linger"]).toBe(5);
    }
  });

  it("state subscriptions fire on browser-pushed state changes", async () => {
    const engine = bridge.handleFor("default");
    const registry = buildToolRegistry(createPresetStore(presetDir));
    const setTempo = registry.get("set_tempo")!;

    const seen: number[] = [];
    engine.subscribe("state-changed", (s) => {
      if (typeof s.session.tempo === "number") seen.push(s.session.tempo);
    });

    await setTempo.handle({ bpm: 90 }, engine);
    // Give the state-changed push a moment to propagate.
    await new Promise((r) => setTimeout(r, 30));
    expect(seen).toContain(90);
  });

  it("multiple consecutive tool calls all round-trip", async () => {
    const engine = bridge.handleFor("default");
    const registry = buildToolRegistry(createPresetStore(presetDir));
    const setTempo = registry.get("set_tempo")!;
    const setChordMode = registry.get("set_chord_mode")!;
    const setMetronome = registry.get("set_metronome")!;

    await setTempo.handle({ bpm: 100 }, engine);
    await setChordMode.handle({ mode: "bass-led" }, engine);
    const final = await setMetronome.handle({ enabled: true }, engine);

    expect(final.ok).toBe(true);
    if (final.ok) {
      expect(final.state.session.tempo).toBe(100);
      expect(final.state.session.chordMode).toBe("bass-led");
      expect(final.state.session.metronome).toBe(true);
    }
  });
});
