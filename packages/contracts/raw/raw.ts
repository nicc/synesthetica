/**
 * Raw Input Frame Types
 *
 * Protocol-level input from adapters. These types represent what adapters
 * can observe without temporal accumulation or musical interpretation.
 *
 * See RFC 005 for design rationale.
 */

import type { Ms, Confidence } from "../core/time";
import type { SourceId, StreamId } from "../core/provenance";

/**
 * Type alias for MIDI note numbers (0-127).
 * Distinct from the musical Note abstraction.
 */
export type MidiNoteNumber = number;

/**
 * MIDI note-on protocol event.
 */
export interface MidiNoteOn {
  type: "midi_note_on";
  t: Ms;
  note: MidiNoteNumber;
  velocity: number; // 0-127
  channel: number;
}

/**
 * MIDI note-off protocol event.
 */
export interface MidiNoteOff {
  type: "midi_note_off";
  t: Ms;
  note: MidiNoteNumber;
  channel: number;
}

/**
 * MIDI continuous controller event.
 */
export interface MidiCC {
  type: "midi_cc";
  t: Ms;
  controller: number;
  value: number;
  channel: number;
}

/**
 * Audio onset detection event. Feature-style — not tied to a note.
 * Reserved for future feature-extraction adapters; not produced by
 * the polyphonic audio adapter (SPEC 012).
 */
export interface AudioOnset {
  type: "audio_onset";
  t: Ms;
  strength: number; // 0-1
  confidence: Confidence;
}

/**
 * Audio pitch estimation event. Feature-style — not tied to a note.
 * Reserved for future feature-extraction adapters; not produced by
 * the polyphonic audio adapter (SPEC 012).
 */
export interface AudioPitch {
  type: "audio_pitch";
  t: Ms;
  hz: number;
  confidence: Confidence;
}

/**
 * Audio loudness measurement. Feature-style — not tied to a note.
 * Reserved for future feature-extraction adapters; not produced by
 * the polyphonic audio adapter (SPEC 012).
 */
export interface AudioLoudness {
  type: "audio_loudness";
  t: Ms;
  db: number;
  confidence: Confidence;
}

/**
 * Audio note onset detected by a transcription model (SPEC 012).
 *
 * Differs from MidiNoteOn in that:
 *   - `velocity` is `0..1` (not 0..127) — it's derived from audio
 *     analysis (e.g. RMS), not measured directly. Use it relative to
 *     itself within a session; do not treat as absolute loudness.
 *   - `pitch` is a fractional MIDI note number — supports non-12TET
 *     sources (microtonal music, untempered intonation).
 *   - `noteId` is the adapter-assigned identifier used to match
 *     subsequent AudioNoteOff and AudioPitchBend events to this note.
 *     Opaque to consumers.
 *   - `confidence` reflects the model's certainty in the onset.
 */
export interface AudioNoteOn {
  type: "audio_note_on";
  t: Ms;
  noteId: string;
  pitch: number; // MIDI note number; may be fractional
  velocity: number; // 0..1, derived
  confidence: Confidence;
}

/**
 * Audio note release. Matches an earlier AudioNoteOn by noteId.
 */
export interface AudioNoteOff {
  type: "audio_note_off";
  t: Ms;
  noteId: string;
  confidence: Confidence;
}

/**
 * Continuous pitch deviation sample for an active audio note.
 *
 * One sample per analyser frame, tied to a note by noteId. Designed
 * once and applied to three cases (SPEC 012):
 *   1. Polyphonic audio — per-note pitch contour from Basic Pitch
 *      (vibrato, slides, intonation drift)
 *   2. Future monophonic audio — pitch trajectory of the single
 *      voice, sampled at the analyser's frame rate
 *   3. Future MIDI MPE pitch bend — per-note bend value
 *
 * `semitones` is signed deviation from the note's nominal pitch
 * (the value carried on the matching AudioNoteOn). Zero means "right
 * on the nominal pitch."
 */
export interface AudioPitchBend {
  type: "audio_pitch_bend";
  t: Ms;
  noteId: string;
  semitones: number;
  confidence: Confidence;
}

/**
 * Union of all raw input types from adapters.
 */
export type RawInput =
  | MidiNoteOn
  | MidiNoteOff
  | MidiCC
  | AudioOnset
  | AudioPitch
  | AudioLoudness
  | AudioNoteOn
  | AudioNoteOff
  | AudioPitchBend;

/**
 * Frame of raw input from an adapter.
 * Protocol-level - no musical interpretation.
 */
export interface RawInputFrame {
  t: Ms;
  source: SourceId;
  stream: StreamId;
  inputs: RawInput[];
}
