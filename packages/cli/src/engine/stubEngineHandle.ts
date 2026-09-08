/**
 * StubEngineHandle — in-memory implementation used for unit tests
 * and for the CLI's `--no-mcp` standalone smoke path (Chunk F).
 * Records every op it receives; exposes state to assertions.
 *
 * NOT a real engine — no rendering, no adapter, no stabilizers.
 * It just tracks state so tool handlers can be exercised without
 * a browser.
 */

import type {
  EngineHandle,
  StateSnapshot,
  RecentEvent,
  RecentEventsEnvelope,
  AvailableInput,
  Unsubscribe,
} from "./engineHandle.js";
import { defaultMacroValues } from "./defaultMacroValues.js";

export interface StubOptions {
  label?: string;
  initialMacros?: Record<string, number | string>;
}

export class StubEngineHandle implements EngineHandle {
  readonly label: string;
  status: "starting" | "running" | "stopping" | "error" = "running";

  private state: StateSnapshot;
  private events: RecentEvent[] = [];
  private nextEventId = 0;
  private stateSubscribers: Array<(s: StateSnapshot) => void> = [];

  /** Public log of every method call, for test assertions. */
  readonly opLog: Array<{ method: string; args: unknown[] }> = [];

  private startedAtIso: string | null = null;
  private startedAtMs: number | null = null;

  constructor(opts: StubOptions = {}) {
    this.label = opts.label ?? "default";
    const initial = { ...defaultMacroValues, ...(opts.initialMacros ?? {}) };
    this.state = {
      instance: this.label,
      // Stubs treat intents = effective — no consumer runtime to
      // diverge from. Real handles rebuild effective from live
      // consumers on every publish.
      macros: { intents: { ...initial }, effective: { ...initial } },
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

  /**
   * Test-only: mark a session as started at wall-clock `startedAtMs`.
   * Real engines capture this when the input session begins; stubs
   * let tests supply it so the temporal envelope can be exercised.
   */
  startSession(startedAtMs: number = Date.now()): void {
    this.startedAtMs = startedAtMs;
    this.startedAtIso = new Date(startedAtMs).toISOString();
    this.state.startedAt = this.startedAtIso;
  }

  // ---- macros ----
  async setMacro(name: string, value: number | string): Promise<StateSnapshot> {
    this.opLog.push({ method: "setMacro", args: [name, value] });
    this.state.macros = {
      intents: { ...this.state.macros.intents, [name]: value },
      effective: { ...this.state.macros.effective, [name]: value },
    };
    return this.publishState();
  }

  // ---- session ----
  async setKey(root: number | null, mode: string | null): Promise<StateSnapshot> {
    this.opLog.push({ method: "setKey", args: [root, mode] });
    this.state.session.tonic = root;
    this.state.session.mode = mode;
    return this.publishState();
  }
  async setTempo(bpm: number | null): Promise<StateSnapshot> {
    this.opLog.push({ method: "setTempo", args: [bpm] });
    this.state.session.tempo = bpm;
    return this.publishState();
  }
  async setMeter(beatsPerBar: number | null, beatValue: number | null): Promise<StateSnapshot> {
    this.opLog.push({ method: "setMeter", args: [beatsPerBar, beatValue] });
    this.state.session.beatsPerBar = beatsPerBar;
    this.state.session.beatValue = beatValue;
    return this.publishState();
  }
  async setChordMode(mode: "harmonic" | "bass-led"): Promise<StateSnapshot> {
    this.opLog.push({ method: "setChordMode", args: [mode] });
    this.state.session.chordMode = mode;
    return this.publishState();
  }
  async setMetronome(enabled: boolean): Promise<StateSnapshot> {
    this.opLog.push({ method: "setMetronome", args: [enabled] });
    this.state.session.metronome = enabled;
    return this.publishState();
  }

  // ---- input ----
  async setInput(source: string): Promise<StateSnapshot> {
    this.opLog.push({ method: "setInput", args: [source] });
    this.state.input = source;
    return this.publishState();
  }

  // ---- helper ----
  async setHueForPitch(pc: number, hue: number): Promise<StateSnapshot> {
    this.opLog.push({ method: "setHueForPitch", args: [pc, hue] });
    // Stub math: just record the intent; real impl adjusts
    // system:colour-mapping:reference (and direction) so the given
    // pc maps to the given hue.
    this.state.macros = {
      intents: { ...this.state.macros.intents, "system:colour-mapping:reference": hue },
      effective: { ...this.state.macros.effective, "system:colour-mapping:reference": hue },
    };
    return this.publishState();
  }

  // ---- presets ----
  async switchPreset(name: string): Promise<StateSnapshot> {
    this.opLog.push({ method: "switchPreset", args: [name] });
    this.state.activePreset = name;
    return this.publishState();
  }
  async savePreset(name: string): Promise<StateSnapshot> {
    this.opLog.push({ method: "savePreset", args: [name] });
    return this.state;
  }

  // ---- state ----
  async getStateSnapshot(): Promise<StateSnapshot> {
    return this.state;
  }
  /** Test-only: seed the available-inputs list for getAvailableInputs. */
  private availableInputs: AvailableInput[] = [];
  setAvailableInputs(inputs: AvailableInput[]): void {
    this.availableInputs = inputs;
  }
  async getAvailableInputs(): Promise<AvailableInput[]> {
    return [...this.availableInputs];
  }

  async getRecentEvents(limit = 100, since?: number): Promise<RecentEventsEnvelope> {
    let events = this.events;
    if (since !== undefined) events = events.filter((e) => e.id > since);
    return {
      startedAt: this.startedAtIso,
      now: this.startedAtMs !== null ? Date.now() - this.startedAtMs : null,
      events: events.slice(-limit),
    };
  }

  /** Test-only: inject a synthetic event into the recent-events buffer. */
  injectEvent(kind: string, payload: Record<string, unknown> = {}): void {
    this.events.push({
      id: this.nextEventId++,
      t: Date.now(),
      kind,
      ...payload,
    });
  }

  // ---- subscriptions ----
  subscribe(
    _event: "state-changed",
    callback: (s: StateSnapshot) => void,
  ): Unsubscribe {
    this.stateSubscribers.push(callback);
    return () => {
      this.stateSubscribers = this.stateSubscribers.filter((c) => c !== callback);
    };
  }

  // ---- lifecycle ----
  async close(): Promise<void> {
    this.status = "stopping";
    this.stateSubscribers = [];
  }

  // ---- internal ----
  private publishState(): StateSnapshot {
    // Return a defensive copy; real engines shouldn't leak mutable state
    // to callers. Refresh `now` at snapshot time so subscribers see a
    // fresh session-ms reading.
    this.state.now =
      this.startedAtMs !== null ? Date.now() - this.startedAtMs : null;
    const snapshot: StateSnapshot = JSON.parse(JSON.stringify(this.state));
    for (const cb of this.stateSubscribers) cb(snapshot);
    return snapshot;
  }
}
