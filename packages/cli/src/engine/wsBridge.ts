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

import { WebSocketServer, type RawData, type WebSocket } from "ws";
import {
  ENGINE_BRIDGE_PROTOCOL,
  type BrowserToCli,
  type CliToBrowser,
  type EngineCallMessage,
  type EngineMethod,
  type EngineStateSnapshot,
  type EngineRecentEvent,
  type EngineRecentEventsEnvelope,
  type AvailableInput,
  type MacroValue,
} from "@synesthetica/contracts";
import { EngineDisconnectedError, type EngineHandle, type Unsubscribe } from "./engineHandle.js";
import { LOOPBACK_HOST, isLoopbackOrigin } from "../loopback.js";

const CALL_TIMEOUT_MS = 5_000;
/** How long a disconnected tab gets to reconnect (e.g. a page reload)
 *  before calls fail with EngineDisconnectedError. */
const RECONNECT_GRACE_MS = 2_000;


export interface WsBridgeOptions {
  port: number;
  /** Called for every stderr-worthy line. */
  log?: (line: string) => void;
  /** Override RECONNECT_GRACE_MS (tests). */
  reconnectGraceMs?: number;
}

export interface WsBridgeHandle {
  port: number;
  /** Get (or create) the engine handle for a given instance label. */
  handleFor(label: string): EngineHandle;
  /**
   * Resolve when the browser at `label` sends `pipeline-ready`.
   * Rejects on timeout. Called by SessionManager.start() to hold
   * `start_session` open until the pipeline can actually receive
   * tool calls. Resolves immediately if already ready.
   */
  awaitPipelineReady(label: string, timeoutMs: number): Promise<void>;
  close(): Promise<void>;
}

/** In-process record of one connected browser instance. */
interface BridgeConnection {
  label: string;
  ws: WebSocket;
  /** True while `ws` is open. The connection record (and its last
   *  snapshot) outlives the socket so a reconnect can reuse it, but
   *  nothing is served from a closed tab's state. */
  open: boolean;
  state: EngineStateSnapshot;
  events: EngineRecentEvent[];
  eventCap: number;
  /** True after the browser sends `pipeline-ready`. Setter tools
   *  arriving before this hit a race (the tab is loading). */
  pipelineReady: boolean;
  /** Resolvers for callers awaiting pipeline-ready. Drained on the
   *  arriving message; new calls resolve immediately when ready. */
  readyWaiters: Array<() => void>;
}

interface PendingCall {
  resolve(value: unknown): void;
  reject(err: Error): void;
  timer: NodeJS.Timeout;
}

export async function startWsBridge(opts: WsBridgeOptions): Promise<WsBridgeHandle> {
  const log = opts.log ?? (() => {});
  const wss = new WebSocketServer({ port: opts.port, host: LOOPBACK_HOST });
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

  wss.on("connection", (ws, req) => {
    if (!isLoopbackOrigin(req.headers.origin)) {
      log(`wsBridge: rejected connection from origin '${req.headers.origin}'`);
      ws.close(1008, "origin not allowed");
      return;
    }
    let helloSeen = false;
    let label: string | null = null;

    ws.on("message", (raw) => {
      let msg: BrowserToCli;
      try {
        msg = JSON.parse(rawToString(raw)) as BrowserToCli;
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
        // Typed as our protocol constant, but a peer on another version
        // sends whatever it has.
        const peerProtocol: unknown = msg.protocol;
        if (peerProtocol !== ENGINE_BRIDGE_PROTOCOL) {
          log(`wsBridge: protocol mismatch (peer=${String(peerProtocol)}, ours=${ENGINE_BRIDGE_PROTOCOL})`);
          ws.close(1002, "protocol version mismatch");
          return;
        }
        helloSeen = true;
        label = msg.label;
        pendingByConn.set(ws, new Map());
        const existing = connections.get(label);
        if (existing) {
          // Reconnect — replace the socket, reset ready flag until
          // the browser re-signals (a fresh tab is a fresh init).
          existing.ws = ws;
          existing.open = true;
          existing.pipelineReady = false;
        } else {
          connections.set(label, {
            label,
            ws,
            open: true,
            state: emptyState(label),
            events: [],
            eventCap: 1000,
            pipelineReady: false,
            readyWaiters: [],
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
      } else if (msg.type === "pipeline-ready") {
        conn.pipelineReady = true;
        // Drain waiters — they were parked in awaitPipelineReady.
        const waiters = conn.readyWaiters;
        conn.readyWaiters = [];
        for (const resolve of waiters) resolve();
        log(`wsBridge: '${label}' pipeline ready`);
      }
    });

    ws.on("close", () => {
      if (label === null) return;
      const conn = connections.get(label);
      // A socket already replaced by a reconnect closing late changes nothing.
      if (!conn || conn.ws !== ws) return;
      conn.open = false;
      conn.pipelineReady = false;
      handles.get(label)?.notifyDisconnected();
      log(`wsBridge: '${label}' disconnected`);
    });
  });

  return {
    port: boundPort,
    handleFor(label) {
      let handle = handles.get(label);
      if (!handle) {
        handle = new WSBackedEngineHandle(label, opts.reconnectGraceMs ?? RECONNECT_GRACE_MS, {
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
    awaitPipelineReady(label: string, timeoutMs: number): Promise<void> {
      return new Promise((resolve, reject) => {
        const check = () => {
          const conn = connections.get(label);
          if (conn?.pipelineReady) {
            resolve();
            return true;
          }
          return false;
        };
        if (check()) return;
        // Not yet connected — wait for the connection then park.
        const timer = setTimeout(() => {
          const conn = connections.get(label);
          if (conn) {
            conn.readyWaiters = conn.readyWaiters.filter((w) => w !== onReady);
          }
          reject(
            new Error(
              `timed out after ${timeoutMs}ms waiting for browser at '${label}' to signal pipeline-ready`,
            ),
          );
        }, timeoutMs);
        const onReady = () => {
          clearTimeout(timer);
          resolve();
        };
        // If the connection already exists but isn't ready yet, park directly.
        const existing = connections.get(label);
        if (existing) {
          existing.readyWaiters.push(onReady);
        } else {
          // Poll shortly for the connection then park. In practice the
          // browser hello arrives within a few hundred ms of start_session.
          const pollInterval = setInterval(() => {
            const conn = connections.get(label);
            if (conn) {
              clearInterval(pollInterval);
              if (conn.pipelineReady) {
                clearTimeout(timer);
                resolve();
              } else {
                conn.readyWaiters.push(onReady);
              }
            }
          }, 50);
          // Ensure poll stops when timer fires.
          timer.unref?.();
        }
      });
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
  private subscribers: Array<(s: EngineStateSnapshot) => void> = [];
  /** Callers parked in awaitConnected, resolved on the next connect. */
  private connectWaiters: Array<() => void> = [];

  constructor(
    label: string,
    private readonly reconnectGraceMs: number,
    private deps: WsBridgeDeps,
  ) {
    this.label = label;
    // If already connected (rare race), mark running immediately.
    if (deps.getConnection()?.open) this.status = "running";
  }

  notifyConnected(): void {
    this.status = "running";
    const waiters = this.connectWaiters;
    this.connectWaiters = [];
    for (const resolve of waiters) resolve();
  }

  notifyDisconnected(): void {
    if (this.status === "running") this.status = "starting";
  }

  /** True when a tab is connected now, or connects within `timeoutMs`. */
  awaitConnected(timeoutMs: number = this.reconnectGraceMs): Promise<boolean> {
    if (this.deps.getConnection()?.open) return Promise.resolve(true);
    return new Promise((resolve) => {
      const onConnect = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.connectWaiters = this.connectWaiters.filter((w) => w !== onConnect);
        resolve(false);
      }, timeoutMs);
      this.connectWaiters.push(onConnect);
    });
  }

  markClosed(): void {
    this.status = "stopping";
    this.subscribers = [];
  }

  publishStateChange(snapshot: EngineStateSnapshot): void {
    for (const cb of this.subscribers) cb(snapshot);
  }

  // ---- calls ----
  async setMacro(name: string, value: MacroValue): Promise<EngineStateSnapshot> {
    return this.call("setMacro", [name, value]) as Promise<EngineStateSnapshot>;
  }
  async setKey(root: number | null, mode: string | null): Promise<EngineStateSnapshot> {
    return this.call("setKey", [root, mode]) as Promise<EngineStateSnapshot>;
  }
  async setTempo(bpm: number | null): Promise<EngineStateSnapshot> {
    return this.call("setTempo", [bpm]) as Promise<EngineStateSnapshot>;
  }
  async setMeter(beatsPerBar: number | null, beatValue: number | null): Promise<EngineStateSnapshot> {
    return this.call("setMeter", [beatsPerBar, beatValue]) as Promise<EngineStateSnapshot>;
  }
  async setChordMode(mode: "harmonic" | "bass-led"): Promise<EngineStateSnapshot> {
    return this.call("setChordMode", [mode]) as Promise<EngineStateSnapshot>;
  }
  async setMetronome(enabled: boolean): Promise<EngineStateSnapshot> {
    return this.call("setMetronome", [enabled]) as Promise<EngineStateSnapshot>;
  }
  async setInput(source: string): Promise<EngineStateSnapshot> {
    return this.call("setInput", [source]) as Promise<EngineStateSnapshot>;
  }
  async setHueForPitch(pc: number, hue: number): Promise<EngineStateSnapshot> {
    return this.call("setHueForPitch", [pc, hue]) as Promise<EngineStateSnapshot>;
  }
  async switchPreset(name: string): Promise<EngineStateSnapshot> {
    return this.call("switchPreset", [name]) as Promise<EngineStateSnapshot>;
  }
  async savePreset(name: string): Promise<EngineStateSnapshot> {
    return this.call("savePreset", [name]) as Promise<EngineStateSnapshot>;
  }

  async getStateSnapshot(): Promise<EngineStateSnapshot> {
    if (!(await this.awaitConnected())) throw new EngineDisconnectedError(this.label);
    const conn = this.deps.getConnection();
    if (conn) {
      // The cached snapshot's `now` is from the last state-changed
      // push, so two get_state reads within a quiet window return
      // the same session-ms. Recompute `now` freshly from startedAt
      // + wall-clock so temporal reasoning ("how long has this been
      // going?") anchors on current time rather than stale write time.
      return withFreshNow(conn.state);
    }
    return this.call("getStateSnapshot", []) as Promise<EngineStateSnapshot>;
  }
  async getRecentEvents(limit = 100, since?: number): Promise<EngineRecentEventsEnvelope> {
    return this.call("getRecentEvents", [limit, since]) as Promise<EngineRecentEventsEnvelope>;
  }
  async clearRecentEvents(): Promise<EngineStateSnapshot> {
    return this.call("clearRecentEvents", []) as Promise<EngineStateSnapshot>;
  }
  async getAvailableInputs(): Promise<AvailableInput[]> {
    return this.call("getAvailableInputs", []) as Promise<AvailableInput[]>;
  }

  subscribe(
    _event: "state-changed",
    callback: (snapshot: EngineStateSnapshot) => void,
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
    // A tab that is loading or reloading gets the grace period to connect.
    if (!(await this.awaitConnected())) throw new EngineDisconnectedError(this.label);
    const conn = this.deps.getConnection();
    if (!conn?.open) throw new EngineDisconnectedError(this.label);
    const id = this.nextCallId++;
    const msg: EngineCallMessage = { type: "call", id, method, args };
    return this.deps.sendCall(conn.ws, msg, id);
  }
}

/**
 * Return the snapshot with a freshly-computed `now` field. When
 * `startedAt` is set (session is input-active), now = ms since that
 * ISO instant; otherwise leave it null. Non-mutating — returns a
 * shallow-cloned session with the updated field so subscribers
 * still see the shared cached `state` unchanged.
 */
function withFreshNow(snap: EngineStateSnapshot): EngineStateSnapshot {
  if (!snap.startedAt) return snap;
  const startedMs = Date.parse(snap.startedAt);
  if (Number.isNaN(startedMs)) return snap;
  return { ...snap, now: Date.now() - startedMs };
}

function emptyState(label: string): EngineStateSnapshot {
  return {
    instance: label,
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

// Suppress lint on unused-in-source local re-export helpers.
export type { CliToBrowser };

/** A ws message as text. Text frames arrive as one Buffer; handle the
 *  fragmented and ArrayBuffer forms ws can also deliver. */
function rawToString(raw: RawData): string {
  if (Array.isArray(raw)) return Buffer.concat(raw).toString("utf8");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  return raw.toString("utf8");
}
