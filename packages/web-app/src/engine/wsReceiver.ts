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

  const send = (msg: BrowserToCli) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
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
      log(`wsReceiver: connected to ${opts.url} as '${opts.label}'`);
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
    close() {
      closed = true;
      if (ws) ws.close();
    },
  };
}
