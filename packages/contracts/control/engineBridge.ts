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
  | "clearRecentEvents"
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
 * `intents` — the last value asked for per macro, populated by any
 *   of set_macro, set_hue_for_pitch, switch_preset (repopulates
 *   with the preset's stored values), or a panel widget edit
 *   (the user dragging a slider dispatches through the same path).
 *   Compound macros are keyed by the compound id; leaves' intents
 *   are stored separately when set directly. Reflects "what was
 *   asked for" regardless of who did the asking.
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

/**
 * Where the session is in its lifecycle. Distinguishes the boot-time
 * ambiguity a plain `startedAt: null` can't resolve — pipeline can
 * exist and receive tool calls before any input adapter is running,
 * which is a distinct state from "no session at all".
 *
 * - `no-session`  — start_session hasn't been called (or was stopped).
 *                   The MCP server holds stdio; no pipeline exists.
 * - `spawned`     — start_session has succeeded and the pipeline is
 *                   wired, but no input adapter has been picked yet.
 *                   Setters take effect on consumers; no notes flowing.
 * - `input-active`— an input source is selected and the render loop
 *                   is running; startedAt is stamped and events accrue.
 */
export type SessionPhase = "no-session" | "spawned" | "input-active";

/**
 * Browser permission state for the input sources the pipeline uses.
 * Matches the Permissions API's PermissionState enum. When the
 * browser doesn't expose a queryable state for a source (some
 * Firefox versions for Web MIDI without the add-on), the field
 * defaults to "prompt" so the LLM's guidance ("click Allow") is
 * still the right shape.
 */
export type PermissionState = "granted" | "prompt" | "denied";

export interface SessionPermissions {
  /** Web MIDI access — required for MIDI device enumeration + input. */
  midi: PermissionState;
  /** Microphone access — required for audio input via Basic Pitch. */
  audio: PermissionState;
}

/** State snapshot shape (mirror of engine/engineHandle.ts). */
export interface EngineStateSnapshot {
  instance: string;
  macros: MacroState;
  /**
   * Browser permissions the pipeline's input paths depend on.
   * Populated by the browser on `pipeline-ready` from
   * `navigator.permissions.query`; updated via `onchange` when the
   * user clicks Allow / Block. When `list_inputs` returns fewer
   * devices than the user expects, check this field before assuming
   * a cable is unplugged — `midi: "prompt"` means the browser
   * hasn't been authorised yet.
   */
  permissions: SessionPermissions;
  session: {
    tonic: number | null;
    mode: string | null;
    tempo: number | null;
    beatsPerBar: number | null;
    beatValue: number | null;
    chordMode: "harmonic" | "bass-led";
    metronome: boolean;
    /** Session lifecycle phase — see SessionPhase. */
    phase: SessionPhase;
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
 * musical layer, not the scene layer (see synesthetica-lnc).
 *
 * Bitemporal: `t` is the event clock (raw MIDI / audio timestamp of
 * the musical event itself — a note-on's `onset`, a note-off's
 * `release`, a chord's `onset`); `frameT` is the observation clock
 * (the animation-frame boundary at which the buffer noticed the
 * event). Use `t` for drift arithmetic and any question about the
 * music. Use `frameT` for "N seconds ago" and any question about the
 * observation. The two match when we've lost the event clock (see
 * the vanish-fallback path in recentEvents.ts) but usually differ by
 * a few ms.
 *
 * Payload shape depends on `kind`:
 * - `note-on`  → { noteId, pitch, pitchClass, octave, velocity, confidence, part }
 * - `note-off` → { noteId, pitch, pitchClass, octave, velocity, part }
 * - `chord-detected` / `chord-changed` → { chordId, voicing, pitchClasses, bass, harmonic, bassLed, isInverted, inversion, part, previousChordId? }
 */
export interface EngineRecentEvent {
  id: number;
  /** Event clock — the raw ms timestamp of the underlying musical event. */
  t: number;
  /** Observation clock — the animation-frame boundary at which the buffer captured it. */
  frameT: number;
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

/**
 * Sent by the browser once it has instantiated the VisualPipeline
 * with all lenses / vocab / stabilizer factories and is ready to
 * receive engine calls that mutate consumer state. Distinct from
 * `hello` (which is the pre-init WS handshake) — see SPEC 014
 * §Lifecycle. SessionManager.start() on the CLI awaits this
 * message before returning `ok: true` to the LLM.
 */
export interface EnginePipelineReadyMessage {
  type: "pipeline-ready";
  /** Instance label, matches the initial hello. */
  label: string;
}

export type BrowserToCli =
  | EngineHelloMessage
  | EngineResultMessage
  | EngineStateChangedMessage
  | EnginePipelineReadyMessage;

/** Current wire protocol version. Both ends must agree. */
export const ENGINE_BRIDGE_PROTOCOL = 1 as const;
