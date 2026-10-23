/**
 * EngineHandle — the CLI's abstract interface to one engine instance.
 * Hides the transport (browser-WebSocket, in-process, whatever else
 * comes later) behind a stable method surface.
 *
 * SPEC 013 §Engine Channel. See the concrete implementations under
 * ./impl/ for the browser-WebSocket wiring; StubEngineHandle for
 * testing.
 */

import type {
  AvailableInput,
  EngineRecentEventsEnvelope,
  EngineStateSnapshot,
  MacroValue,
} from "@synesthetica/contracts";

// State, recent-event and input shapes are defined in contracts
// (control/engineBridge.ts) and shared with the browser side of the
// bridge; SPEC 013 §Resources and §Recent Events.

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

  /**
   * True when a browser tab is connected to this engine now, or
   * connects within the timeout (a reload gets a short grace period).
   * False means the session is running but its tab is gone.
   */
  awaitConnected(timeoutMs?: number): Promise<boolean>;

  // -- Aesthetic macros --
  setMacro(name: string, value: MacroValue): Promise<EngineStateSnapshot>;

  // -- Session controls --
  setKey(root: number | null, mode: string | null): Promise<EngineStateSnapshot>;
  setTempo(bpm: number | null): Promise<EngineStateSnapshot>;
  setMeter(beatsPerBar: number | null, beatValue: number | null): Promise<EngineStateSnapshot>;
  setChordMode(mode: "harmonic" | "bass-led"): Promise<EngineStateSnapshot>;
  setMetronome(enabled: boolean): Promise<EngineStateSnapshot>;

  // -- Input source --
  setInput(source: string): Promise<EngineStateSnapshot>;

  // -- Helper --
  setHueForPitch(pc: number, hue: number): Promise<EngineStateSnapshot>;

  // -- Presets --
  switchPreset(name: string): Promise<EngineStateSnapshot>;
  savePreset(name: string): Promise<EngineStateSnapshot>;

  // -- State --
  getStateSnapshot(): Promise<EngineStateSnapshot>;
  getRecentEvents(limit?: number, since?: number): Promise<EngineRecentEventsEnvelope>;
  /** Drop the recent-events buffer contents + diff state. Keeps the
   *  pipeline subscription alive so subsequent frames repopulate. */
  clearRecentEvents(): Promise<EngineStateSnapshot>;

  // -- Discovery --
  /** Enumerate connected MIDI + audio inputs. Powers inputs://. */
  getAvailableInputs(): Promise<AvailableInput[]>;

  // -- Subscriptions (Chunk E wires these up) --
  subscribe(
    event: "state-changed",
    callback: (snapshot: EngineStateSnapshot) => void,
  ): Unsubscribe;

  // -- Lifecycle --
  close(): Promise<void>;
}

/**
 * The session is running but no browser tab is connected to it: the tab
 * was closed, crashed, or never reconnected. The MCP layer reports this
 * as ENGINE_DISCONNECTED; start_session reopens the tab.
 */
export class EngineDisconnectedError extends Error {
  readonly code = "ENGINE_DISCONNECTED";
  constructor(label: string) {
    super(`the visualiser tab for '${label}' isn't connected (closed or crashed). Call start_session to reopen it.`);
  }
}
