import { describe, it, expect, beforeEach, afterEach } from "vitest";
import WebSocket from "ws";
import { startWsBridge, type WsBridgeHandle } from "../src/engine/wsBridge.js";
import {
  ENGINE_BRIDGE_PROTOCOL,
  type BrowserToCli,
  type CliToBrowser,
  type EngineStateSnapshot,
} from "@synesthetica/contracts";

let bridge: WsBridgeHandle;

// The bridge reports each lifecycle step through its `log` option
// after the state change it describes. Tests wait on those lines
// rather than sleeping for the bridge to catch up.
let logLines: string[];
let logWaiters: Array<{ re: RegExp; from: number; resolve: () => void }>;

function onLog(line: string): void {
  logLines.push(line);
  logWaiters = logWaiters.filter((w) => {
    if (!matchesFrom(w.re, w.from)) return true;
    w.resolve();
    return false;
  });
}

function matchesFrom(re: RegExp, from: number): boolean {
  return logLines.slice(from).some((l) => re.test(l));
}

/** Resolve when a log line matching `re` arrives at or after index `from`. */
function logged(re: RegExp, from = logLines.length): Promise<void> {
  if (matchesFrom(re, from)) return Promise.resolve();
  return new Promise((resolve) => logWaiters.push({ re, from, resolve }));
}

beforeEach(async () => {
  logLines = [];
  logWaiters = [];
  bridge = await startWsBridge({ port: 0, log: onLog });
});
afterEach(async () => {
  await bridge.close();
});

/** Open a socket, say hello, and resolve once the bridge has registered it. */
function connectAs(label: string): Promise<WebSocket> {
  const registered = logged(new RegExp(`'${label}' connected`));
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${bridge.port}`);
    ws.once("open", () => {
      const hello: BrowserToCli = {
        type: "hello",
        label,
        protocol: ENGINE_BRIDGE_PROTOCOL,
      };
      ws.send(JSON.stringify(hello));
      void registered.then(() => resolve(ws));
    });
    ws.once("error", reject);
  });
}

/** Resolve with the next state-changed snapshot the handle publishes. */
function nextStateChange(handle: ReturnType<WsBridgeHandle["handleFor"]>): Promise<EngineStateSnapshot> {
  return new Promise((resolve) => {
    const unsubscribe = handle.subscribe("state-changed", (snap) => {
      unsubscribe();
      resolve(snap);
    });
  });
}

/** One turn of the event loop, so already-queued settlements run. */
const flush = () => new Promise<void>((r) => setImmediate(r));

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
    expect(handle.status).toBe("running");
    ws.close();
  });
});

describe("wsBridge — origin check", () => {
  it("closes connections from a non-loopback browser origin", async () => {
    const ws = new WebSocket(`ws://localhost:${bridge.port}`, {
      headers: { Origin: "https://example.com" },
    });
    const code = await new Promise<number>((resolve) => ws.once("close", resolve));
    expect(code).toBe(1008);
  });

  it("does not let a foreign origin take over an existing label", async () => {
    const handle = bridge.handleFor("default");
    const real = await connectAs("default");
    const foreign = new WebSocket(`ws://localhost:${bridge.port}`, {
      headers: { Origin: "https://example.com" },
    });
    foreign.once("open", () => {
      const hello: BrowserToCli = { type: "hello", label: "default", protocol: ENGINE_BRIDGE_PROTOCOL };
      foreign.send(JSON.stringify(hello));
    });
    await new Promise((resolve) => foreign.once("close", resolve));
    expect(handle.status).toBe("running");
    expect(real.readyState).toBe(WebSocket.OPEN);
    real.close();
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
    const received = nextStateChange(handle);

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
          metronome: false,
          phase: "no-session",
        },
        input: null,
        activePreset: null,
        permissions: { midi: "granted", audio: "prompt" },
        startedAt: null,
        now: null,
      },
    };
    ws.send(JSON.stringify(push));
    await received;
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
        metronome: false,
        phase: "no-session",
      },
      input: null,
      activePreset: null,
    };
    const received = nextStateChange(handle);
    ws.send(JSON.stringify({ type: "state-changed", snapshot }));
    await received;
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
    // The connection is registered, so the waiter parks synchronously.
    const readyPromise = bridge.awaitPipelineReady("default", 2_000);
    // Simulate the browser signalling ready.
    ws.send(JSON.stringify({ type: "pipeline-ready", label: "default" }));
    await expect(readyPromise).resolves.toBeUndefined();
    ws.close();
  });

  it("awaitPipelineReady resolves immediately if already ready", async () => {
    const ws = await connectAs("default");
    const ready = logged(/'default' pipeline ready/);
    ws.send(JSON.stringify({ type: "pipeline-ready", label: "default" }));
    await ready;
    // Resolves synchronously from the ready flag: a single event-loop
    // turn is enough, no message has to arrive.
    let resolved = false;
    void bridge.awaitPipelineReady("default", 500).then(() => (resolved = true));
    await flush();
    expect(resolved).toBe(true);
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
    await bridge.awaitPipelineReady("default", 500);
    // Reconnect — same label.
    const disconnected = logged(/'default' disconnected/);
    ws1.close();
    await disconnected;
    const ws2 = await connectAs("default");
    // Should NOT be ready yet — the fresh tab hasn't re-signalled.
    // Readiness only changes on an inbound pipeline-ready, and none is
    // in flight, so one event-loop turn shows whether the flag reset.
    const pending = bridge.awaitPipelineReady("default", 500);
    let resolved = false;
    void pending.then(() => (resolved = true));
    await flush();
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
