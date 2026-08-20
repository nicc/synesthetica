/**
 * EngineHandle — the CLI's abstract interface to one engine instance.
 * Hides the transport (browser-WebSocket, in-process, whatever else
 * comes later) behind a stable method surface.
 *
 * SPEC 013 §Engine Channel. See the concrete implementations under
 * ./impl/ for the browser-WebSocket wiring; StubEngineHandle for
 * testing.
 */

// -----------------------------------------------------------------
// State snapshot returned after every successful control op.
// Shape follows SPEC 013 §Resources — the same object served under
// state://<label>/current.
// -----------------------------------------------------------------

export interface StateSnapshot {
  instance: string;
  /** Current macro values, keyed by macro id. */
  macros: Record<string, number | string>;
  /** Prescribed musical frame. Nulls = not prescribed. */
  session: {
    tonic: number | null;
    mode: string | null;
    tempo: number | null;
    beatsPerBar: number | null;
    beatValue: number | null;
    chordMode: "harmonic" | "bass-led";
    metronome: boolean;
  };
  /** Input source (e.g. "midi:Yamaha P-125", "audio:built-in-mic"). */
  input: string | null;
  /** Active preset name, if any. */
  activePreset: string | null;
}

// -----------------------------------------------------------------
// Recent-events buffer entry (Chunk E; declared here for the
// interface). SPEC 013 §Recent Events.
// -----------------------------------------------------------------

export interface RecentEvent {
  id: number;
  t: number;
  kind: string;
  [key: string]: unknown;
}

// -----------------------------------------------------------------
// Unsubscribe handle
// -----------------------------------------------------------------

export type Unsubscribe = () => void;

// -----------------------------------------------------------------
// EngineHandle interface — the full control surface per SPEC 013
// -----------------------------------------------------------------

export interface EngineHandle {
  readonly label: string;
  readonly status: "starting" | "running" | "stopping" | "error";

  // -- Aesthetic macros --
  setMacro(name: string, value: number | string): Promise<StateSnapshot>;

  // -- Session controls --
  setKey(root: number | null, mode: string | null): Promise<StateSnapshot>;
  setTempo(bpm: number | null): Promise<StateSnapshot>;
  setMeter(beatsPerBar: number | null, beatValue: number | null): Promise<StateSnapshot>;
  setChordMode(mode: "harmonic" | "bass-led"): Promise<StateSnapshot>;
  setMetronome(enabled: boolean): Promise<StateSnapshot>;

  // -- Input source --
  setInput(source: string): Promise<StateSnapshot>;

  // -- Helper --
  setHueForPitch(pc: number, hue: number): Promise<StateSnapshot>;

  // -- Presets --
  switchPreset(name: string): Promise<StateSnapshot>;
  savePreset(name: string): Promise<StateSnapshot>;

  // -- State --
  getStateSnapshot(): Promise<StateSnapshot>;
  getRecentEvents(limit?: number, since?: number): Promise<RecentEvent[]>;

  // -- Subscriptions (Chunk E wires these up) --
  subscribe(
    event: "state-changed",
    callback: (snapshot: StateSnapshot) => void,
  ): Unsubscribe;

  // -- Lifecycle --
  close(): Promise<void>;
}
