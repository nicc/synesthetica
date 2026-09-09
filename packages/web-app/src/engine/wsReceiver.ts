/**
 * Browser-side WebSocket receiver.
 *
 * Opens a persistent connection to the CLI's WS bridge, identifies
 * this tab with a `hello` message, and dispatches inbound engine
 * calls to a user-supplied handler. Auto-reconnects on drop with
 * exponential backoff.
 *
 * The handler owns the actual engine plumbing (pipeline setters,
 * metronome, input session lifecycle). This receiver only speaks the
 * wire protocol; it doesn't know about VisualPipeline.
 */

import {
  ENGINE_BRIDGE_PROTOCOL,
  type BrowserToCli,
  type CliToBrowser,
  type EngineMethod,
  type EngineRecentEvent,
  type EngineStateSnapshot,
} from "@synesthetica/contracts";

export type EngineCallHandler = (
  method: EngineMethod,
  args: readonly unknown[],
) => Promise<EngineStateSnapshot | EngineRecentEvent[] | unknown>;

export interface WsReceiverOptions {
  /** WS URL — e.g. "ws://localhost:8765". */
  url: string;
  /** Instance label ("default" unless overridden). */
  label: string;
  /**
   * Called for every incoming engine call. Return the value the CLI
   * expects back; throw to send an error result.
   */
  onCall: EngineCallHandler;
  /** Optional; log to console.error when omitted. */
  log?: (line: string) => void;
}

export interface WsReceiverHandle {
  /** True when the WS is currently open and past the hello handshake. */
  isConnected(): boolean;
  /** Push a state change to the CLI (fanned out to subscribers). */
  publishStateChanged(snapshot: EngineStateSnapshot): void;
  /**
   * Signal to the CLI that the browser has finished wiring the
   * VisualPipeline (lenses + vocab + stabilizer factories). The
   * SessionManager holds `start_session` open awaiting this before
   * returning ok:true to the LLM. Idempotent from the receiver's
   * side — if already sent this connection, it's a no-op.
   */
  publishPipelineReady(): void;
  /** Close the connection and stop reconnecting. */
  close(): void;
}

const MIN_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 8_000;

export function startWsReceiver(opts: WsReceiverOptions): WsReceiverHandle {
  const log = opts.log ?? ((line: string) => console.error(line));
  let ws: WebSocket | null = null;
  let closed = false;
  let backoff = MIN_BACKOFF_MS;
  let connected = false;
  /**
   * publishPipelineReady() may be called before the WS is open —
   * main.ts fires it right after mountWsReceiver returns, which is
   * synchronous while the socket takes a tick to open. We split
   * "the caller wants us to send ready" from "we've actually sent
   * it on this connection" so the open handler can flush.
   */
  let pipelineReadyIntended = false;
  let pipelineReadySent = false;

  const send = (msg: BrowserToCli) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  };

  const maybeFlushPipelineReady = () => {
    if (!pipelineReadyIntended || pipelineReadySent) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    send({ type: "pipeline-ready", label: opts.label });
    pipelineReadySent = true;
  };

  const connect = () => {
    if (closed) return;
    connected = false;
    try {
      ws = new WebSocket(opts.url);
    } catch (err) {
      log(`wsReceiver: cannot open ${opts.url}: ${err}`);
      scheduleReconnect();
      return;
    }
    ws.addEventListener("open", () => {
      // Send hello immediately; the CLI ignores everything else until it arrives.
      send({ type: "hello", label: opts.label, protocol: ENGINE_BRIDGE_PROTOCOL });
      connected = true;
      backoff = MIN_BACKOFF_MS;
      // Fresh connection = fresh handshake. The CLI resets its
      // pipeline-ready flag on reconnect too; re-signal once ready.
      pipelineReadySent = false;
      log(`wsReceiver: connected to ${opts.url} as '${opts.label}'`);
      // Flush any pipeline-ready intent that arrived before we opened
      // (main.ts calls publishPipelineReady synchronously right after
      // mountWsReceiver returns).
      maybeFlushPipelineReady();
    });
    ws.addEventListener("close", () => {
      connected = false;
      scheduleReconnect();
    });
    ws.addEventListener("error", () => {
      // 'close' fires next; suppress duplicate reconnect scheduling here.
    });
    ws.addEventListener("message", (ev) => {
      let msg: CliToBrowser;
      try {
        msg = JSON.parse(String(ev.data)) as CliToBrowser;
      } catch {
        log(`wsReceiver: dropped malformed frame`);
        return;
      }
      if (msg.type === "call") {
        void handleCall(msg.id, msg.method, msg.args);
      }
    });
  };

  const scheduleReconnect = () => {
    if (closed) return;
    setTimeout(() => {
      backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      connect();
    }, backoff);
  };

  const handleCall = async (id: number, method: EngineMethod, args: readonly unknown[]) => {
    try {
      const value = await opts.onCall(method, args);
      send({ type: "result", id, ok: true, value });
    } catch (err) {
      send({
        type: "result",
        id,
        ok: false,
        error: { message: err instanceof Error ? err.message : String(err) },
      });
    }
  };

  connect();

  return {
    isConnected: () => connected,
    publishStateChanged(snapshot) {
      send({ type: "state-changed", snapshot });
    },
    publishPipelineReady() {
      pipelineReadyIntended = true;
      maybeFlushPipelineReady();
    },
    close() {
      closed = true;
      if (ws) ws.close();
    },
  };
}
