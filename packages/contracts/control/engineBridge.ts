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
  | "getRecentEvents"
  | "getAvailableInputs";

/**
 * One available input device — MIDI or audio. Returned as an array
 * by getAvailableInputs / served under inputs://.
 *
 * `sourceString` is the exact value to pass to set_input(source): the
 * scheme lives in this field so the LLM doesn't have to reconstruct
 * "midi:<id>" from the id + kind separately.
 */
export interface AvailableInput {
  /** Kind — determines the sourceString scheme. */
  kind: "midi" | "audio";
  /** Human-readable name (e.g. "Yamaha P-125", "Built-in Microphone"). */
  name: string;
  /** Underlying device id (MIDI port id, audio deviceId, etc.). Not stable across sessions on some browsers. */
  id: string;
  /** The exact value to pass to set_input(source: ...) to select this device. */
  sourceString: string;
}

/**
 * Per-instance macro state, split by SPEC 014 §1.9 into user-intent
 * and consumer-observed effective values.
 *
 * `intents` — the last value the user (LLM or panel) set via
 *   set_macro or set_hue_for_pitch. Includes compound macros keyed
 *   by the compound id (the leaves' intents are stored separately).
 *   Reflects "what was asked for".
 *
 * `effective` — sourced from consumer.readMacros() every publish, so
 *   it always reflects what the pipeline consumers are actually
 *   running with. Keyed by macro id via the manifest's declared
 *   consumers[]. If a consumer silently ignored a setter, `effective`
 *   diverges from `intents` and the drift is visible in state://.
 *   Compound macros do NOT appear in `effective` (they have no direct
 *   consumer — their leaves do).
 */
export interface MacroState {
  intents: Record<string, number | string>;
  effective: Record<string, number | string>;
}

/** State snapshot shape (mirror of engine/engineHandle.ts). */
export interface EngineStateSnapshot {
  instance: string;
  macros: MacroState;
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
  /** Wall-clock time (ISO 8601) at session start; null when no
   *  session is active. Stable for the lifetime of the session —
   *  every recent-event's `t` is milliseconds since this instant. */
  startedAt: string | null;
  /** Session-time (ms since startedAt) at snapshot construction.
   *  Roughly-current when read from a cached snapshot; recent-events
   *  reads carry a fresher value via the envelope's `now` field. */
  now: number | null;
}

/**
 * One captured musical event. Event stream is intentionally at the
 * musical layer, not the scene layer (see synesthetica-lnc). Payload
 * shape depends on `kind`.
 */
export interface EngineRecentEvent {
  id: number;
  t: number;
  kind: "note-on" | "note-off" | "chord-detected" | "chord-changed" | string;
  [key: string]: unknown;
}

/**
 * Envelope for state://<label>/recent-events reads. Wraps the event
 * slice in a temporal frame of reference: `startedAt` (wall-clock
 * ISO at session start) lets the LLM reconstruct absolute wall-clock
 * times; `now` (session-ms at read time) lets the LLM answer "N
 * seconds ago" with plain subtraction.
 *
 * All three of `startedAt`, `now`, and per-event `t` may be null
 * when no session is active (in which case events will also be
 * empty).
 */
export interface EngineRecentEventsEnvelope {
  startedAt: string | null;
  now: number | null;
  events: EngineRecentEvent[];
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
