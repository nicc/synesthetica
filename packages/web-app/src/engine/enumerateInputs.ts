/**
 * Single source of truth for the "what inputs are available?" list.
 *
 * Same enumeration powers:
 *   - the UI panel's input:source dropdown (via optionsFor hook)
 *   - the inputs:// MCP resource (via wsReceiver.onCall)
 *
 * That way the LLM and the user always see the same set. If the two
 * ever diverged (e.g. user sees a device the LLM doesn't) natural-
 * language references would break.
 */

import type { WebMidiSource } from "@synesthetica/adapters";
import type { AvailableInput } from "@synesthetica/contracts";

/**
 * Build the list of currently-available inputs.
 *
 * MIDI: enumerated live from the passed-in WebMidiSource (returns
 * empty when null / not initialised).
 *
 * Audio: single synthetic "audio" entry representing the default
 * microphone routed through Basic Pitch. Per-device audio enumeration
 * isn't wired yet — MediaDevices.enumerateDevices() would need
 * getUserMedia permission to expose labels, which requires a UI
 * prompt we haven't threaded here. Future work.
 */
export function enumerateInputs(midi: WebMidiSource | null): AvailableInput[] {
  const inputs: AvailableInput[] = [];
  if (midi) {
    for (const info of midi.getInputs()) {
      inputs.push({
        kind: "midi",
        name: info.name,
        id: info.id,
        sourceString: `midi:${info.id}`,
      });
    }
  }
  inputs.push({
    kind: "audio",
    name: "Default microphone (Basic Pitch)",
    id: "default",
    sourceString: "audio",
  });
  return inputs;
}

/**
 * Convert AvailableInput[] to the widget option shape the panel
 * generator expects: `{ value, label }`. Value is the sourceString
 * (what gets dispatched via set_input); label is a formatted display.
 */
export function inputsToPanelOptions(
  inputs: AvailableInput[],
): Array<{ value: string; label: string }> {
  return inputs.map((i) => ({
    value: i.sourceString,
    label: i.kind === "midi" ? `MIDI: ${i.name}` : `Audio: ${i.name}`,
  }));
}
