/**
 * WS-level wiring coverage — the CLI-side integration companion to
 * packages/engine/test/wiringCoverage.test.ts.
 *
 * Drives every declared macro from the MCP tool layer all the way
 * through the transport to a real pipeline consumer, then reads the
 * `effective` view back out of state:// and asserts the consumer
 * received it. The chain:
 *
 *   setMacroTool.handle(...)
 *     → WSBackedEngineHandle.setMacro
 *       → JSON EngineCallMessage over real WebSocket
 *         → browser-side onCall dispatcher (this file's stub)
 *           → VisualPipeline.setMacro
 *             → consumer.readMacros() (via readEffectiveMacros)
 *
 * Catches transport-layer regressions (message shape / id correlation
 * / method-name drift / state envelope shape) that the engine-only
 * coverage test can't see. SPEC 014 §Wiring coverage.
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import WebSocket from "ws";
import { startWsBridge, type WsBridgeHandle } from "../src/engine/wsBridge.js";
import { setMacroTool } from "../src/tools/macroTools.js";
import {
  ENGINE_BRIDGE_PROTOCOL,
  productionManifest,
  type BrowserToCli,
  type CliToBrowser,
  type EngineStateSnapshot,
  type MacroConsumer,
  type EngineMethod,
} from "@synesthetica/contracts";
import {
  VisualPipeline,
  NoteTrackingStabilizer,
  DynamicsStabilizer,
  ChordDetectionStabilizer,
  HarmonyStabilizer,
  MusicalVisualVocabulary,
  RhythmGrammar,
  HarmonyGrammar,
  DynamicsGrammar,
  IdentityCompositor,
} from "@synesthetica/engine";

/**
 * Stand-in for the web-app's browser-side dispatcher: instantiates a
 * real headless VisualPipeline and translates inbound engine calls
 * into pipeline method invocations. Kept minimal — only the surface
 * this test exercises. Publishes state-changed after every op so the
 * CLI's cached snapshot stays fresh.
 */
class FakeBrowserWithPipeline {
  private ws!: WebSocket;
  private pipeline: VisualPipeline;
  private vocabulary: MusicalVisualVocabulary;
  private state: EngineStateSnapshot;

  constructor(private port: number, private label: string) {
    const partId = "test-part" as const;
    this.pipeline = new VisualPipeline({
      canvasSize: { width: 800, height: 600 },
      rngSeed: 42,
      partId,
    });
    this.pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
    this.pipeline.addStabilizerFactory(() => new DynamicsStabilizer({ partId }));
    this.pipeline.addStabilizerFactory(() => new ChordDetectionStabilizer({ partId }));
    this.pipeline.addStabilizerFactory(() => new HarmonyStabilizer({ partId }));
    this.vocabulary = new MusicalVisualVocabulary();
    this.pipeline.setVocabulary(this.vocabulary);
    this.pipeline.addGrammar(new RhythmGrammar());
    this.pipeline.addGrammar(new HarmonyGrammar());
    this.pipeline.addGrammar(new DynamicsGrammar());
    this.pipeline.setCompositor(new IdentityCompositor());
    // Trigger partState creation so stabilizer macro dispatch reaches
    // instantiated stabilizers.
    this.pipeline.requestFrame(0);

    this.state = {
      instance: label,
      macros: { intents: {}, effective: {} },
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
      startedAt: null,
      now: null,
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
    // Let the bridge process hello + register the handle.
    await new Promise((r) => setTimeout(r, 20));
  }

  close(): void {
    this.ws.close();
  }

  private onMessage(raw: WebSocket.RawData): void {
    let msg: CliToBrowser;
    try {
      msg = JSON.parse(String(raw)) as CliToBrowser;
    } catch {
      return;
    }
    if (msg.type !== "call") return;
    this.handleCall(msg.id, msg.method, msg.args);
  }

  private handleCall(id: number, method: EngineMethod, args: readonly unknown[]): void {
    try {
      switch (method) {
        case "setMacro": {
          const [name, value] = args as [string, number | string];
          this.state.macros.intents[name] = value;
          this.pipeline.setMacro(name, value);
          break;
        }
        case "setHueForPitch": {
          const [pc, hue] = args as [number, number];
          this.vocabulary.setHueForPitch(pc, hue);
          const derived = this.vocabulary.readMacros()["system:colour-mapping:reference"];
          if (typeof derived === "number") {
            this.state.macros.intents["system:colour-mapping:reference"] = derived;
          }
          break;
        }
        case "getStateSnapshot":
          // Handled by returning current snapshot below.
          break;
        default:
          // Other engine methods not exercised by this test.
          break;
      }
      const snap = this.snapshot();
      const result: BrowserToCli = { type: "result", id, ok: true, value: snap };
      this.ws.send(JSON.stringify(result));
      const push: BrowserToCli = { type: "state-changed", snapshot: snap };
      this.ws.send(JSON.stringify(push));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result: BrowserToCli = { type: "result", id, ok: false, error: { message } };
      this.ws.send(JSON.stringify(result));
    }
  }

  private snapshot(): EngineStateSnapshot {
    // effective is rebuilt from the live pipeline on every snapshot —
    // matches web-app/main.ts's publishState behaviour.
    this.state.macros.effective = this.pipeline.readEffectiveMacros(
      productionManifest.macros,
    );
    return {
      ...this.state,
      session: { ...this.state.session },
      macros: {
        intents: { ...this.state.macros.intents },
        effective: { ...this.state.macros.effective },
      },
    };
  }
}

let bridge: WsBridgeHandle;
let browser: FakeBrowserWithPipeline;

beforeEach(async () => {
  bridge = await startWsBridge({ port: 0, log: () => {} });
  browser = new FakeBrowserWithPipeline(bridge.port, "default");
  await browser.connect();
});
afterEach(async () => {
  browser.close();
  await bridge.close();
});

/** Pick an in-range test value distinct from the macro's default. */
function pickTestValue(
  macro: { type: string; default?: number | string },
  range?: [number, number],
  enumValues?: Array<{ value: number | string }>,
): number | string {
  if (macro.type === "continuous" && range) {
    const [lo, hi] = range;
    const mid = lo + (hi - lo) * 0.37;
    if (mid !== macro.default) return mid;
    return lo + (hi - lo) * 0.13;
  }
  if (macro.type === "discrete" && enumValues) {
    for (const v of enumValues) {
      if (v.value !== macro.default) return v.value;
    }
  }
  throw new Error("cannot pick a test value");
}

describe("WS wiring coverage — set_macro reaches consumer through the full chain", () => {
  for (const macro of productionManifest.macros) {
    if (macro.type === "compound") continue;

    it(`${macro.id} takes effect end-to-end (tool → WS → pipeline consumer)`, async () => {
      const engine = bridge.handleFor("default");

      const range = macro.type === "continuous" ? macro.range : undefined;
      const enumValues = macro.type === "discrete" ? macro.enumValues : undefined;
      const testValue = pickTestValue(macro, range, enumValues);

      const result = await setMacroTool.handle(
        { name: macro.id, value: testValue },
        engine,
      );
      expect(result.ok, JSON.stringify(result)).toBe(true);
      if (!result.ok) return;

      // Intent recorded (user-facing view).
      expect(
        result.state.macros.intents[macro.id],
        `intent for ${macro.id} not recorded`,
      ).toBe(testValue);

      // Effective view built from live consumers — proves the value
      // survived the WS transport AND was accepted by every declared
      // consumer of this macro.
      expect(
        result.state.macros.effective[macro.id],
        `effective value for ${macro.id} not observed on consumer — ` +
          `declared consumers: ${JSON.stringify((macro.consumers as MacroConsumer[]).map((c) => `${c.kind}:${c.id}.${c.macroKey}`))}`,
      ).toBe(testValue);
    });
  }
});
