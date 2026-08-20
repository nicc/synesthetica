/**
 * Wires renderPanel dispatch events to the local pipeline + metronome.
 *
 * Only the widgets whose backing engine setters exist are wired to real
 * effects. Macros (harmony:linger, time-horizon, etc.) will be plumbed
 * through as their pipeline setters land; for now they log to the
 * console so a user sees the intent flowed through the panel correctly
 * without pretending state changed.
 *
 * The point in Phase 1 is to prove the SPEC 013 control surface —
 * "user + LLM operate through the same setters" — end-to-end for the
 * session controls. Macro plumbing catches up in a later phase.
 */

import type {
  VisualPipeline,
  Metronome,
} from "@synesthetica/engine";
import type {
  PitchClass,
  ModeId,
  ChordInterpretationMode,
} from "@synesthetica/contracts";
import type { PanelDispatch, PanelDispatchValue } from "./renderPanel.js";

export interface PanelBindingTargets {
  /** Called with the pipeline that owns session state — may be null before a session starts. */
  getPipeline(): VisualPipeline | null;
  /** Metronome may or may not be initialised (needs a user gesture). */
  getMetronome(): Metronome | null;
  /** Called when the metronome toggle changes; owner decides how to construct/enable it. */
  onMetronomeToggle?(enabled: boolean): void;
}

interface KeyState {
  tonic: PitchClass | null;
  mode: ModeId | null;
}

/**
 * Build the dispatch callback for renderPanel. Owns a small tonic/mode
 * cache because setKey requires both together — the panel dispatches
 * them separately (they're two child widgets of the pair) but the
 * pipeline API is atomic.
 */
export function bindPanelToPipeline(
  targets: PanelBindingTargets,
): PanelDispatch {
  const key: KeyState = { tonic: null, mode: null };
  const meter: { bpb: number | null; unit: number } = { bpb: null, unit: 4 };

  return function dispatch(id: string, value: PanelDispatchValue): void {
    const pipeline = targets.getPipeline();
    switch (id) {
      // --- Session controls ---
      case "session:tonic": {
        key.tonic = value === null ? null : (Number(value) as PitchClass);
        applyKey(pipeline, key);
        return;
      }
      case "session:mode": {
        key.mode = value === null ? null : (value as ModeId);
        applyKey(pipeline, key);
        return;
      }
      case "session:tempo": {
        if (pipeline) {
          pipeline.setTempo(value === null ? null : Number(value));
        }
        const met = targets.getMetronome();
        met?.setTempo(value === null ? null : Number(value));
        return;
      }
      case "session:beats-per-bar": {
        meter.bpb = value === null ? null : Number(value);
        applyMeter(pipeline, meter, targets);
        return;
      }
      case "session:beat-value": {
        meter.unit = value === null ? 4 : Number(value);
        applyMeter(pipeline, meter, targets);
        return;
      }
      case "session:chord-mode": {
        if (pipeline && (value === "harmonic" || value === "bass-led")) {
          pipeline.setChordInterpretation(value as ChordInterpretationMode);
        }
        return;
      }
      case "session:metronome": {
        targets.onMetronomeToggle?.(Boolean(value));
        return;
      }
      // --- Everything else: macros not yet plumbed to pipeline setters. ---
      default: {
        // eslint-disable-next-line no-console
        console.info(
          `[panel] dispatch '${id}' = ${JSON.stringify(value)} (macro plumbing pending)`,
        );
        return;
      }
    }
  };
}

function applyKey(
  pipeline: VisualPipeline | null,
  key: KeyState,
): void {
  if (!pipeline) return;
  if (key.tonic === null || key.mode === null) {
    pipeline.setKey(null);
  } else {
    pipeline.setKey({ root: key.tonic, mode: key.mode });
  }
}

function applyMeter(
  pipeline: VisualPipeline | null,
  meter: { bpb: number | null; unit: number },
  targets: PanelBindingTargets,
): void {
  if (!pipeline) return;
  pipeline.setMeter(meter.bpb, meter.unit);
  if (meter.bpb !== null) targets.getMetronome()?.setMeter(meter.bpb);
}
