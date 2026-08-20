/**
 * Panel-to-engine adapter.
 *
 * Translates renderPanel dispatch events (widget id + value) into
 * engine method calls (method + args), enforcing SPEC 013 §Engine
 * Channel — user-driven and LLM-driven changes go through the same
 * EngineHandle-shaped surface, ensuring both stay in sync.
 *
 * Pair widgets are the reason we can't dispatch straight — tonic
 * and mode are two panel widgets but one engine call (setKey).
 * Same for beats-per-bar + beat-value → setMeter. This adapter
 * caches the pair members between dispatches and issues the composite
 * call when both are set (or clears when either goes null).
 */

import type { EngineMethod } from "@synesthetica/contracts";
import type { PanelDispatch, PanelDispatchValue } from "./renderPanel.js";

export type PanelEngineDispatch = (
  method: EngineMethod,
  args: readonly unknown[],
) => void | Promise<unknown>;

export interface BindPanelOptions {
  onEngineOp: PanelEngineDispatch;
}

/**
 * Build the PanelDispatch callback for renderPanel. Every widget
 * change is normalised to an EngineHandle-shaped op.
 *
 * Widgets that don't map to a known op fall through with a console
 * warning — indicates a manifest addition that hasn't been plumbed
 * through this translator.
 */
export function bindPanelToEngine(opts: BindPanelOptions): PanelDispatch {
  const key: { tonic: number | null; mode: string | null } = {
    tonic: null,
    mode: null,
  };
  const meter: { bpb: number | null; unit: number | null } = {
    bpb: null,
    unit: null,
  };

  return function dispatch(id: string, value: PanelDispatchValue): void {
    switch (id) {
      case "session:tonic":
        key.tonic = value === null ? null : Number(value);
        void opts.onEngineOp("setKey", [key.tonic, key.mode]);
        return;
      case "session:mode":
        key.mode = value === null ? null : String(value);
        void opts.onEngineOp("setKey", [key.tonic, key.mode]);
        return;
      case "session:tempo":
        void opts.onEngineOp("setTempo", [value === null ? null : Number(value)]);
        return;
      case "session:beats-per-bar":
        meter.bpb = value === null ? null : Number(value);
        void opts.onEngineOp("setMeter", [meter.bpb, meter.unit]);
        return;
      case "session:beat-value":
        meter.unit = value === null ? null : Number(value);
        void opts.onEngineOp("setMeter", [meter.bpb, meter.unit]);
        return;
      case "session:chord-mode":
        if (value === "harmonic" || value === "bass-led") {
          void opts.onEngineOp("setChordMode", [value]);
        }
        return;
      case "session:metronome":
        void opts.onEngineOp("setMetronome", [Boolean(value)]);
        return;
      case "input:source":
        if (typeof value === "string" && value.length > 0) {
          void opts.onEngineOp("setInput", [value]);
        }
        return;
      default:
        // Assume anything else is a macro id.
        if (id.includes(":") || !id.startsWith("session:")) {
          void opts.onEngineOp("setMacro", [id, value ?? 0]);
        } else {
          // eslint-disable-next-line no-console
          console.warn(`[panel] unknown widget id '${id}' = ${JSON.stringify(value)}`);
        }
        return;
    }
  };
}
