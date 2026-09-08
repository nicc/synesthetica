import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { startWsBridge, type WsBridgeHandle } from "../src/engine/wsBridge.js";
import {
  ENGINE_BRIDGE_PROTOCOL,
  type BrowserToCli,
  type CliToBrowser,
} from "@synesthetica/contracts";

let bridge: WsBridgeHandle;

beforeEach(async () => {
  bridge = await startWsBridge({ port: 0, log: () => {} });
});
afterEach(async () => {
  await bridge.close();
});

function connectAs(label: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${bridge.port}`);
    ws.once("open", () => {
      const hello: BrowserToCli = {
        type: "hello",
        label,
        protocol: ENGINE_BRIDGE_PROTOCOL,
      };
      ws.send(JSON.stringify(hello));
      // Give the CLI a tick to record the connection.
      setTimeout(() => resolve(ws), 20);
    });
    ws.once("error", reject);
  });
}

describe("wsBridge — connection lifecycle", () => {
  it("assigns an OS-picked port when port=0", () => {
    expect(bridge.port).toBeGreaterThan(0);
  });

  it("handleFor returns a handle whose label matches the input", () => {
    const handle = bridge.handleFor("piano");
    expect(handle.label).toBe("piano");
    expect(handle.status).toBe("starting");
  });

  it("handle status transitions to running when browser connects + says hello", async () => {
    const handle = bridge.handleFor("default");
    expect(handle.status).toBe("starting");
    const ws = await connectAs("default");
    // The CLI processes the hello asynchronously.
    await new Promise((r) => setTimeout(r, 20));
    expect(handle.status).toBe("running");
    ws.close();
  });
});

describe("wsBridge — call round-trip", () => {
  it("engine call is delivered to the browser and result is returned", async () => {
    const handle = bridge.handleFor("default");
    const ws = await connectAs("default");

    // Browser side: echo every call as ok:true value=args.
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as CliToBrowser;
      if (msg.type === "call") {
        const reply: BrowserToCli = {
          type: "result",
          id: msg.id,
          ok: true,
          value: { method: msg.method, args: msg.args },
        };
        ws.send(JSON.stringify(reply));
      }
    });

    const result = await handle.setTempo(140);
    expect(result).toEqual({ method: "setTempo", args: [140] });
    ws.close();
  });

  it("engine error propagates as a thrown Error", async () => {
    const handle = bridge.handleFor("default");
    const ws = await connectAs("default");
    ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw)) as CliToBrowser;
      if (msg.type === "call") {
        const reply: BrowserToCli = {
          type: "result",
          id: msg.id,
          ok: false,
          error: { message: "no such macro" },
        };
        ws.send(JSON.stringify(reply));
      }
    });
    await expect(handle.setMacro("bogus", 0)).rejects.toThrow(/no such macro/);
    ws.close();
  });
});

describe("wsBridge — state-changed fan-out", () => {
  it("browser-published state-changed reaches subscribers", async () => {
    const handle = bridge.handleFor("default");
    const ws = await connectAs("default");

    const seen: Array<unknown> = [];
    handle.subscribe("state-changed", (snap) => seen.push(snap));

    const push: BrowserToCli = {
      type: "state-changed",
      snapshot: {
        instance: "default",
        macros: {
          intents: { "harmony:linger": 5 },
          effective: { "harmony:linger": 5 },
        },
        session: {
          tonic: null,
          mode: null,
          tempo: 120,
          beatsPerBar: null,
          beatValue: null,
          chordMode: "harmonic",
        harmonyLingerUnit: "seconds",
          metronome: false,
        },
        input: null,
        activePreset: null,
      },
    };
    ws.send(JSON.stringify(push));
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((seen[0] as any).session.tempo).toBe(120);
    ws.close();
  });

  it("getStateSnapshot returns the last state-changed without a round-trip", async () => {
    const handle = bridge.handleFor("default");
    const ws = await connectAs("default");
    const snapshot = {
      instance: "default",
      macros: {
        intents: { "harmony:linger": 4 },
        effective: { "harmony:linger": 4 },
      },
      session: {
        tonic: 2,
        mode: "dorian",
        tempo: 100,
        beatsPerBar: 4,
        beatValue: 4,
        chordMode: "harmonic" as const,
        harmonyLingerUnit: "seconds" as const,
        metronome: false,
      },
      input: null,
      activePreset: null,
    };
    ws.send(JSON.stringify({ type: "state-changed", snapshot }));
    await new Promise((r) => setTimeout(r, 20));
    const got = await handle.getStateSnapshot();
    expect(got.session.tempo).toBe(100);
    expect(got.macros.intents["harmony:linger"]).toBe(4);
    expect(got.macros.effective["harmony:linger"]).toBe(4);
    ws.close();
  });
});

describe("wsBridge — pipeline-ready gating", () => {
  it("awaitPipelineReady resolves after the browser sends pipeline-ready", async () => {
    const ws = await connectAs("default");
    const readyPromise = bridge.awaitPipelineReady("default", 2_000);
    // Give the promise a tick to arm.
    await new Promise((r) => setTimeout(r, 20));
    // Simulate the browser signalling ready.
    ws.send(JSON.stringify({ type: "pipeline-ready", label: "default" }));
    await expect(readyPromise).resolves.toBeUndefined();
    ws.close();
  });

  it("awaitPipelineReady resolves immediately if already ready", async () => {
    const ws = await connectAs("default");
    ws.send(JSON.stringify({ type: "pipeline-ready", label: "default" }));
    await new Promise((r) => setTimeout(r, 20));
    // Second await returns without waiting.
    await expect(bridge.awaitPipelineReady("default", 500)).resolves.toBeUndefined();
    ws.close();
  });

  it("awaitPipelineReady rejects on timeout when no ready arrives", async () => {
    // No browser at all — timeout should fire.
    await expect(
      bridge.awaitPipelineReady("ghost", 100),
    ).rejects.toThrow(/timed out/);
  });

  it("reconnecting resets the ready flag (fresh tab is a fresh init)", async () => {
    const ws1 = await connectAs("default");
    ws1.send(JSON.stringify({ type: "pipeline-ready", label: "default" }));
    await new Promise((r) => setTimeout(r, 20));
    await bridge.awaitPipelineReady("default", 500);
    // Reconnect — same label.
    ws1.close();
    await new Promise((r) => setTimeout(r, 20));
    const ws2 = await connectAs("default");
    // Should NOT be ready yet — the fresh tab hasn't re-signalled.
    const pending = bridge.awaitPipelineReady("default", 500);
    let resolved = false;
    void pending.then(() => (resolved = true));
    await new Promise((r) => setTimeout(r, 100));
    expect(resolved).toBe(false);
    ws2.send(JSON.stringify({ type: "pipeline-ready", label: "default" }));
    await pending;
    ws2.close();
  });
});

describe("wsBridge — protocol guardrails", () => {
  it("rejects first-frame-not-hello with a close", async () => {
    const ws = new WebSocket(`ws://localhost:${bridge.port}`);
    await new Promise<void>((resolve) => {
      ws.once("open", () => resolve());
    });
    const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.send(JSON.stringify({ type: "result", id: 0, ok: true, value: null }));
    await closed;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });

  it("rejects protocol mismatch on hello", async () => {
    const ws = new WebSocket(`ws://localhost:${bridge.port}`);
    await new Promise<void>((resolve) => ws.once("open", () => resolve()));
    const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
    ws.send(JSON.stringify({ type: "hello", label: "x", protocol: 999 }));
    await closed;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});
