import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ENGINE_BRIDGE_PROTOCOL,
  type BrowserToCli,
  type CliToBrowser,
  type EngineStateSnapshot,
} from "@synesthetica/contracts";
import { startWsReceiver, type WsReceiverHandle } from "../src/engine/wsReceiver.js";

/**
 * Stand-in for the browser WebSocket. The receiver constructs
 * `new WebSocket(url)` from the global, so the test swaps the global
 * and drives the socket's lifecycle by hand.
 */
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  readonly sent: BrowserToCli[] = [];
  private listeners = new Map<string, Array<(ev: { data?: unknown }) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, fn: (ev: { data?: unknown }) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as BrowserToCli);
  }

  close(): void {
    this.serverClose();
  }

  // ---- test controls ----
  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }
  receive(msg: CliToBrowser | string): void {
    this.emit("message", { data: typeof msg === "string" ? msg : JSON.stringify(msg) });
  }
  serverClose(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", {});
  }
  private emit(type: string, ev: { data?: unknown }): void {
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
}

const URL = "ws://localhost:9999";
const LABEL = "piano";

let receiver: WsReceiverHandle | null = null;

function start(onCall: Parameters<typeof startWsReceiver>[0]["onCall"] = async () => null) {
  receiver = startWsReceiver({ url: URL, label: LABEL, onCall, log: () => {} });
  return receiver;
}

/** The socket the receiver is currently using. */
const current = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

/** Resolve once the socket has sent `count` frames (replies are async). */
async function sentFrames(ws: FakeWebSocket, count: number): Promise<BrowserToCli[]> {
  await vi.waitFor(() => expect(ws.sent.length).toBeGreaterThanOrEqual(count));
  return ws.sent;
}

function snapshot(instance: string): EngineStateSnapshot {
  return {
    instance,
    macros: { intents: {}, effective: {} },
    permissions: { midi: "prompt", audio: "prompt" },
    session: {
      tonic: null,
      mode: null,
      tempo: null,
      beatsPerBar: null,
      beatValue: null,
      chordMode: "harmonic",
      metronome: false,
      phase: "no-session",
    },
    input: null,
    activePreset: null,
    startedAt: null,
    now: null,
  };
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeWebSocket);
});
afterEach(() => {
  receiver?.close();
  receiver = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("wsReceiver — handshake", () => {
  it("connects to the given URL and sends hello with label and protocol as the first frame", () => {
    const r = start();
    const ws = current();
    expect(ws.url).toBe(URL);
    expect(r.isConnected()).toBe(false);
    ws.open();
    expect(ws.sent[0]).toEqual({ type: "hello", label: LABEL, protocol: ENGINE_BRIDGE_PROTOCOL });
    expect(r.isConnected()).toBe(true);
  });

  it("sends nothing before the socket opens", () => {
    const r = start();
    r.publishStateChanged(snapshot(LABEL));
    expect(current().sent).toEqual([]);
  });
});

describe("wsReceiver — call dispatch", () => {
  it("passes method and args to onCall and replies with the value under the same id", async () => {
    const onCall = vi.fn(async (method: string, args: readonly unknown[]) => ({ method, args }));
    start(onCall);
    const ws = current();
    ws.open();
    ws.receive({ type: "call", id: 42, method: "setTempo", args: [140] });
    const sent = await sentFrames(ws, 2);
    expect(onCall).toHaveBeenCalledWith("setTempo", [140]);
    expect(sent[1]).toEqual({ type: "result", id: 42, ok: true, value: { method: "setTempo", args: [140] } });
  });

  it("replies with ok:false and the error message when onCall throws", async () => {
    start(async () => {
      throw new Error("no such macro");
    });
    const ws = current();
    ws.open();
    ws.receive({ type: "call", id: 7, method: "setMacro", args: ["bogus", 0] });
    const sent = await sentFrames(ws, 2);
    expect(sent[1]).toEqual({ type: "result", id: 7, ok: false, error: { message: "no such macro" } });
  });

  it("correlates replies by id when calls resolve out of order", async () => {
    const releases = new Map<number, () => void>();
    start((_method, args) => {
      const id = args[0] as number;
      return new Promise((resolve) => releases.set(id, () => resolve(`value-${id}`)));
    });
    const ws = current();
    ws.open();
    ws.receive({ type: "call", id: 1, method: "setTempo", args: [1] });
    ws.receive({ type: "call", id: 2, method: "setTempo", args: [2] });
    await vi.waitFor(() => expect(releases.size).toBe(2));
    releases.get(2)!();
    releases.get(1)!();
    const sent = await sentFrames(ws, 3);
    const results = sent.filter((m) => m.type === "result");
    expect(results).toEqual([
      { type: "result", id: 2, ok: true, value: "value-2" },
      { type: "result", id: 1, ok: true, value: "value-1" },
    ]);
  });

  it("drops malformed frames and keeps serving calls", async () => {
    const onCall = vi.fn(async () => "ok");
    start(onCall);
    const ws = current();
    ws.open();
    ws.receive("{not json");
    ws.receive({ type: "call", id: 3, method: "getStateSnapshot", args: [] });
    const sent = await sentFrames(ws, 2);
    expect(onCall).toHaveBeenCalledTimes(1);
    expect(sent[1]).toMatchObject({ type: "result", id: 3, ok: true });
  });
});

describe("wsReceiver — publishing", () => {
  it("publishStateChanged sends the snapshot as a state-changed frame", () => {
    const r = start();
    const ws = current();
    ws.open();
    const snap = snapshot(LABEL);
    r.publishStateChanged(snap);
    expect(ws.sent[ws.sent.length - 1]).toEqual({ type: "state-changed", snapshot: snap });
  });

  it("publishPipelineReady before open is sent right after hello once the socket opens", () => {
    const r = start();
    r.publishPipelineReady();
    const ws = current();
    expect(ws.sent).toEqual([]);
    ws.open();
    expect(ws.sent.map((m) => m.type)).toEqual(["hello", "pipeline-ready"]);
    expect(ws.sent[1]).toEqual({ type: "pipeline-ready", label: LABEL });
  });

  it("state published before the socket opens reaches the CLI before pipeline-ready", () => {
    // main.ts publishes "spawned" and signals ready synchronously at load;
    // start_session returns on ready, so the state must already be there.
    const r = start();
    const spawned = { ...snapshot(LABEL), session: { ...snapshot(LABEL).session, phase: "spawned" as const } };
    r.publishStateChanged(spawned);
    r.publishPipelineReady();
    const ws = current();
    ws.open();
    expect(ws.sent.map((m) => m.type)).toEqual(["hello", "state-changed", "pipeline-ready"]);
    expect(ws.sent[1]).toEqual({ type: "state-changed", snapshot: spawned });
  });

  it("publishPipelineReady is sent once per connection", () => {
    const r = start();
    const ws = current();
    ws.open();
    r.publishPipelineReady();
    r.publishPipelineReady();
    expect(ws.sent.filter((m) => m.type === "pipeline-ready")).toHaveLength(1);
  });
});

describe("wsReceiver — reconnect", () => {
  it("reconnects after a drop, re-sends hello, and re-signals pipeline-ready", () => {
    vi.useFakeTimers();
    const r = start();
    const first = current();
    first.open();
    r.publishPipelineReady();
    first.serverClose();
    expect(r.isConnected()).toBe(false);

    vi.runOnlyPendingTimers();
    const second = current();
    expect(second).not.toBe(first);
    expect(second.url).toBe(URL);
    second.open();
    // The CLI resets its ready flag on reconnect, so the tab must say it again.
    expect(second.sent.map((m) => m.type)).toEqual(["hello", "pipeline-ready"]);
    expect(r.isConnected()).toBe(true);
  });

  it("resends the latest state on reconnect, including state published while disconnected", () => {
    vi.useFakeTimers();
    const r = start();
    const first = current();
    first.open();
    r.publishStateChanged(snapshot("before-drop"));
    first.serverClose();
    r.publishStateChanged(snapshot("while-down"));

    vi.runOnlyPendingTimers();
    const second = current();
    second.open();
    expect(second.sent[1]).toEqual({ type: "state-changed", snapshot: snapshot("while-down") });
  });

  it("backs off: each failed attempt waits at least as long as the last, and success resets it", () => {
    vi.useFakeTimers();
    start();
    /** Drop the current socket and return how long the receiver waits before the next one. */
    const delayAfterDrop = (open: boolean): number => {
      const ws = current();
      if (open) ws.open();
      ws.serverClose();
      const before = Date.now();
      vi.advanceTimersToNextTimer();
      expect(current()).not.toBe(ws);
      return Date.now() - before;
    };

    const failures = [1, 2, 3, 4, 5, 6, 7, 8].map(() => delayAfterDrop(false));
    for (let i = 1; i < failures.length; i++) {
      expect(failures[i]).toBeGreaterThanOrEqual(failures[i - 1]);
    }
    expect(failures[1]).toBeGreaterThan(failures[0]);
    // Bounded: it stops growing rather than doubling forever.
    expect(failures[failures.length - 1]).toBe(failures[failures.length - 2]);

    // A successful open resets the backoff to the first-attempt delay.
    expect(delayAfterDrop(true)).toBe(failures[0]);
  });

  it("close() stops reconnecting", () => {
    vi.useFakeTimers();
    const r = start();
    current().open();
    r.close();
    vi.runAllTimers();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(r.isConnected()).toBe(false);
  });
});
