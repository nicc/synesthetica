/**
 * Wire protocol between the CLI-hosted EngineHandle proxy and the
 * browser-hosted engine receiver (SPEC 013 §Engine Channel).
 *
 * Messages are JSON over WebSocket. Each direction has its own union
 * of typed messages. There is no request/response coupling at the
 * protocol layer beyond `id` correlation: every call carries an id
 * the receiver echoes back in the corresponding result.
 *
 * The CLI treats the browser as a persistent single-connection peer
 * per instance. Reconnection is the browser's responsibility; the
 * CLI tolerates transient disconnects by queueing calls up to a
 * short deadline.
 */

// Methods the CLI can call on the engine. Names match EngineHandle.
export type EngineMethod =
  | "setMacro"
  | "setKey"
  | "setTempo"
  | "setMeter"
  | "setChordMode"
  | "setMetronome"
  | "setInput"
  | "setHueForPitch"
  | "switchPreset"
  | "savePreset"
  | "getStateSnapshot"
  | "getRecentEvents";

/** State snapshot shape (mirror of engine/engineHandle.ts). */
export interface EngineStateSnapshot {
  instance: string;
  macros: Record<string, number | string>;
  session: {
    tonic: number | null;
    mode: string | null;
    tempo: number | null;
    beatsPerBar: number | null;
    beatValue: number | null;
    chordMode: "harmonic" | "bass-led";
    metronome: boolean;
  };
  input: string | null;
  activePreset: string | null;
}

export interface EngineRecentEvent {
  id: number;
  t: number;
  kind: string;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------
 * CLI → browser
 * ------------------------------------------------------------------ */

export interface EngineCallMessage {
  type: "call";
  id: number;
  method: EngineMethod;
  args: readonly unknown[];
}

export type CliToBrowser = EngineCallMessage;

/* ------------------------------------------------------------------
 * Browser → CLI
 * ------------------------------------------------------------------ */

/** Sent when the browser opens the WS connection; identifies which instance it hosts. */
export interface EngineHelloMessage {
  type: "hello";
  label: string;
  /** Semver of the protocol; incremented on breaking changes. */
  protocol: 1;
}

export interface EngineResultOkMessage {
  type: "result";
  id: number;
  ok: true;
  value: unknown;
}

export interface EngineResultErrMessage {
  type: "result";
  id: number;
  ok: false;
  error: { message: string; details?: unknown };
}

export type EngineResultMessage = EngineResultOkMessage | EngineResultErrMessage;

/** Pushed when engine state changes (any set_*, preset load, input change). */
export interface EngineStateChangedMessage {
  type: "state-changed";
  snapshot: EngineStateSnapshot;
}

export type BrowserToCli =
  | EngineHelloMessage
  | EngineResultMessage
  | EngineStateChangedMessage;

/** Current wire protocol version. Both ends must agree. */
export const ENGINE_BRIDGE_PROTOCOL = 1 as const;
