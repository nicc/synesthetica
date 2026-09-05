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
 * Audio: enumerated live from navigator.mediaDevices.enumerateDevices().
 * Device LABELS only surface after getUserMedia permission has been
 * granted at least once in the session — until then the browser
 * returns empty labels for privacy. We show generic "Audio input N"
 * placeholders in that case, plus a "default" entry that maps to
 * the browser-chosen input.
 *
 * A "default" entry (sourceString "audio") is always present as a
 * fallback so the user + LLM have something to select before
 * permission is granted.
 */
export async function enumerateInputs(
  midi: WebMidiSource | null,
): Promise<AvailableInput[]> {
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
  inputs.push(...(await enumerateAudioInputs()));
  return inputs;
}

/**
 * Sync variant — MIDI-only, no audio enumeration. Callers that need
 * inputs synchronously (e.g. the initial panel render, before any
 * audio permission has been requested) can use this and defer audio
 * enumeration to a follow-up async refresh.
 */
export function enumerateInputsSync(midi: WebMidiSource | null): AvailableInput[] {
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
  // Default-audio-only fallback for the sync path.
  inputs.push({
    kind: "audio",
    name: "Default microphone",
    id: "default",
    sourceString: "audio",
  });
  return inputs;
}

async function enumerateAudioInputs(): Promise<AvailableInput[]> {
  const list: AvailableInput[] = [];
  // Always offer the "default" audio input first — pre-permission
  // this is the ONLY audio option the user can select without
  // triggering the permission prompt.
  list.push({
    kind: "audio",
    name: "Default microphone",
    id: "default",
    sourceString: "audio",
  });

  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return list;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    let index = 1;
    for (const d of devices) {
      if (d.kind !== "audioinput") continue;
      // Skip the "default" pseudo-device that browsers sometimes
      // report separately — we already have one "default" entry above.
      if (d.deviceId === "default" || d.deviceId === "") continue;
      // Labels are empty pre-permission. Show a placeholder so the
      // widget still has a distinguishable entry; the real label
      // appears after a session starts and we re-enumerate.
      const name = d.label && d.label.trim().length > 0
        ? d.label
        : `Audio input ${index++}`;
      list.push({
        kind: "audio",
        name,
        id: d.deviceId,
        sourceString: `audio:${d.deviceId}`,
      });
    }
  } catch {
    // enumerateDevices can throw in strict contexts; degrade to just
    // the default entry rather than failing the whole enumeration.
  }
  return list;
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
