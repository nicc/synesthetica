/**
 * WebSocket bridge server + WSBackedEngineHandle.
 *
 * Runs on the CLI. Accepts one WebSocket connection per engine
 * instance from the corresponding browser tab. Once connected, the
 * bridge:
 *   - Forwards EngineHandle method calls as JSON messages to the
 *     browser and awaits the correlated result.
 *   - Fans out browser-published state-changed events to local
 *     state-subscribers.
 *
 * SPEC 013 §Engine Channel — the bridge realises the "engine
 * transport is plumbing behind EngineHandle" promise. The MCP server
 * doesn't know or care that state lives in a browser tab.
 */

import { WebSocketServer, type WebSocket } from "ws";
import {
  ENGINE_BRIDGE_PROTOCOL,
  type BrowserToCli,
  type CliToBrowser,
  type EngineCallMessage,
  type EngineMethod,
  type EngineStateSnapshot,
  type EngineRecentEvent,
} from "@synesthetica/contracts";
import type {
  EngineHandle,
  StateSnapshot,
  RecentEventsEnvelope,
  AvailableInput,
  Unsubscribe,
} from "./engineHandle.js";

const CALL_TIMEOUT_MS = 5_000;
const RECONNECT_GRACE_MS = 2_000;

export interface WsBridgeOptions {
  port: number;
  /** Called for every stderr-worthy line. */
  log?: (line: string) => void;
}

export interface WsBridgeHandle {
  port: number;
  /** Get (or create) the engine handle for a given instance label. */
  handleFor(label: string): EngineHandle;
  close(): Promise<void>;
}

/** In-process record of one connected browser instance. */
interface BridgeConnection {
  label: string;
  ws: WebSocket;
  state: EngineStateSnapshot;
  events: EngineRecentEvent[];
  eventCap: number;
}

interface PendingCall {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

export async function startWsBridge(opts: WsBridgeOptions): Promise<WsBridgeHandle> {
  const log = opts.log ?? (() => {});
  const wss = new WebSocketServer({ port: opts.port });
  // With port=0, ws picks an OS-assigned free port. The actual port
  // is only known once the underlying HTTP server has bound. Await
  // the 'listening' event before returning.
  await new Promise<void>((resolve, reject) => {
    wss.once("listening", () => resolve());
    wss.once("error", (err) => reject(err));
  });
  const addr = wss.address();
  const boundPort =
    addr && typeof addr === "object" ? addr.port : opts.port;

  const connections = new Map<string, BridgeConnection>();
  // handleFor may be called before the browser connects. We return a
  // handle that resolves against `connections` at call time.
  const handles = new Map<string, WSBackedEngineHandle>();
  const pendingByConn = new WeakMap<WebSocket, Map<number, PendingCall>>();

  wss.on("connection", (ws) => {
    let helloSeen = false;
    let label: string | null = null;

    ws.on("message", (raw) => {
      let msg: BrowserToCli;
      try {
        msg = JSON.parse(String(raw)) as BrowserToCli;
      } catch {
        log(`wsBridge: dropped malformed frame`);
        return;
      }

      if (!helloSeen) {
        if (msg.type !== "hello") {
          log(`wsBridge: first frame must be 'hello', got '${msg.type}' — closing`);
          ws.close(1002, "hello required");
          return;
        }
        if (msg.protocol !== ENGINE_BRIDGE_PROTOCOL) {
          log(`wsBridge: protocol mismatch (peer=${msg.protocol}, ours=${ENGINE_BRIDGE_PROTOCOL})`);
          ws.close(1002, "protocol version mismatch");
          return;
        }
        helloSeen = true;
        label = msg.label;
        pendingByConn.set(ws, new Map());
        const existing = connections.get(label);
        if (existing) {
          // Reconnect — replace the socket, keep the state snapshot.
          existing.ws = ws;
        } else {
          connections.set(label, {
            label,
            ws,
            state: emptyState(label),
            events: [],
            eventCap: 1000,
          });
        }
        // Notify any waiting handle that a connection now exists.
        const handle = handles.get(label);
        if (handle) handle.notifyConnected();
        log(`wsBridge: '${label}' connected`);
        return;
      }

      if (label === null) return;
      const conn = connections.get(label);
      if (!conn) return;

      if (msg.type === "result") {
        const pending = pendingByConn.get(ws)?.get(msg.id);
        if (!pending) return;
        pendingByConn.get(ws)!.delete(msg.id);
        clearTimeout(pending.timer);
        if (msg.ok) pending.resolve(msg.value);
        else pending.reject(new Error(msg.error.message));
      } else if (msg.type === "state-changed") {
        conn.state = msg.snapshot;
        const handle = handles.get(label);
        handle?.publishStateChange(msg.snapshot);
      }
    });

    ws.on("close", () => {
      if (label !== null) {
        log(`wsBridge: '${label}' disconnected`);
        // Leave conn.state in place so late reads/subscribers see the
        // last-known snapshot. Handle stays alive; reconnection reuses it.
      }
    });
  });

  return {
    port: boundPort,
    handleFor(label) {
      let handle = handles.get(label);
      if (!handle) {
        handle = new WSBackedEngineHandle(label, {
          getConnection: () => connections.get(label) ?? null,
          sendCall: (ws, msg, id) => {
            const table = pendingByConn.get(ws);
            if (!table) return Promise.reject(new Error("no pending table"));
            return new Promise((resolve, reject) => {
              const timer = setTimeout(() => {
                table.delete(id);
                reject(new Error(`engine call ${msg.method}(${id}) timed out`));
              }, CALL_TIMEOUT_MS);
              table.set(id, { resolve, reject, timer });
              ws.send(JSON.stringify(msg));
            });
          },
        });
        handles.set(label, handle);
      }
      return handle;
    },
    async close() {
      for (const handle of handles.values()) handle.markClosed();
      // wss.close() waits for open connections to drain — the
      // browser tab may still be holding a socket, and Chrome's
      // teardown of the WS on tab-close isn't instantaneous. Force
      // any lingering sockets closed FIRST so wss.close resolves
      // promptly. Fix for synesthetica-cip (intermittent hang on
      // SIGINT).
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // best-effort
        }
      }
      await new Promise<void>((resolve) => {
        wss.close(() => resolve());
      });
    },
  };
}

/* ------------------------------------------------------------------
 * WSBackedEngineHandle
 * ------------------------------------------------------------------ */

interface WsBridgeDeps {
  getConnection(): BridgeConnection | null;
  sendCall(ws: WebSocket, msg: EngineCallMessage, id: number): Promise<unknown>;
}

class WSBackedEngineHandle implements EngineHandle {
  status: "starting" | "running" | "stopping" | "error" = "starting";
  readonly label: string;

  private nextCallId = 1;
  private subscribers: Array<(s: StateSnapshot) => void> = [];
  private waitConnected: Promise<void>;
  private resolveConnected!: () => void;

  constructor(label: string, private deps: WsBridgeDeps) {
    this.label = label;
    this.waitConnected = new Promise((resolve) => {
      this.resolveConnected = resolve;
    });
    // If already connected (rare race), resolve immediately.
    if (deps.getConnection()) {
      this.status = "running";
      this.resolveConnected();
    }
  }

  notifyConnected(): void {
    this.status = "running";
    this.resolveConnected();
  }

  markClosed(): void {
    this.status = "stopping";
    this.subscribers = [];
  }

  publishStateChange(snapshot: EngineStateSnapshot): void {
    for (const cb of this.subscribers) cb(snapshot);
  }

  // ---- calls ----
  async setMacro(name: string, value: number | string): Promise<StateSnapshot> {
    return this.call("setMacro", [name, value]) as Promise<StateSnapshot>;
  }
  async setKey(root: number | null, mode: string | null): Promise<StateSnapshot> {
    return this.call("setKey", [root, mode]) as Promise<StateSnapshot>;
  }
  async setTempo(bpm: number | null): Promise<StateSnapshot> {
    return this.call("setTempo", [bpm]) as Promise<StateSnapshot>;
  }
  async setMeter(beatsPerBar: number | null, beatValue: number | null): Promise<StateSnapshot> {
    return this.call("setMeter", [beatsPerBar, beatValue]) as Promise<StateSnapshot>;
  }
  async setChordMode(mode: "harmonic" | "bass-led"): Promise<StateSnapshot> {
    return this.call("setChordMode", [mode]) as Promise<StateSnapshot>;
  }
  async setMetronome(enabled: boolean): Promise<StateSnapshot> {
    return this.call("setMetronome", [enabled]) as Promise<StateSnapshot>;
  }
  async setInput(source: string): Promise<StateSnapshot> {
    return this.call("setInput", [source]) as Promise<StateSnapshot>;
  }
  async setHueForPitch(pc: number, hue: number): Promise<StateSnapshot> {
    return this.call("setHueForPitch", [pc, hue]) as Promise<StateSnapshot>;
  }
  async switchPreset(name: string): Promise<StateSnapshot> {
    return this.call("switchPreset", [name]) as Promise<StateSnapshot>;
  }
  async savePreset(name: string): Promise<StateSnapshot> {
    return this.call("savePreset", [name]) as Promise<StateSnapshot>;
  }

  async getStateSnapshot(): Promise<StateSnapshot> {
    const conn = this.deps.getConnection();
    // Prefer the cached snapshot when available — it's always the
    // most recent state-changed we saw and doesn't require a round trip.
    if (conn) return conn.state as StateSnapshot;
    return this.call("getStateSnapshot", []) as Promise<StateSnapshot>;
  }
  async getRecentEvents(limit = 100, since?: number): Promise<RecentEventsEnvelope> {
    return this.call("getRecentEvents", [limit, since]) as Promise<RecentEventsEnvelope>;
  }
  async getAvailableInputs(): Promise<AvailableInput[]> {
    return this.call("getAvailableInputs", []) as Promise<AvailableInput[]>;
  }

  subscribe(
    _event: "state-changed",
    callback: (snapshot: StateSnapshot) => void,
  ): Unsubscribe {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter((c) => c !== callback);
    };
  }

  async close(): Promise<void> {
    this.markClosed();
  }

  private async call(method: EngineMethod, args: readonly unknown[]): Promise<unknown> {
    if (this.status === "stopping") throw new Error("engine handle closed");
    // Wait for connection, with a grace period so early calls don't
    // immediately fail if the browser hasn't opened its socket yet.
    await Promise.race([
      this.waitConnected,
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error(`no browser connection for '${this.label}' within ${RECONNECT_GRACE_MS}ms`)),
          RECONNECT_GRACE_MS,
        ),
      ),
    ]);
    const conn = this.deps.getConnection();
    if (!conn) throw new Error(`no browser connection for '${this.label}'`);
    const id = this.nextCallId++;
    const msg: EngineCallMessage = { type: "call", id, method, args };
    return this.deps.sendCall(conn.ws, msg, id);
  }
}

function emptyState(label: string): EngineStateSnapshot {
  return {
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

// Suppress lint on unused-in-source local re-export helpers.
export type { CliToBrowser };
