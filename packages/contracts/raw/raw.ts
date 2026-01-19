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
 * Audio onset detection event.
 */
export interface AudioOnset {
  type: "audio_onset";
  t: Ms;
  strength: number; // 0-1
  confidence: Confidence;
}

/**
 * Audio pitch estimation event.
 */
export interface AudioPitch {
  type: "audio_pitch";
  t: Ms;
  hz: number;
  confidence: Confidence;
}

/**
 * Audio loudness measurement.
 */
export interface AudioLoudness {
  type: "audio_loudness";
  t: Ms;
  db: number;
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
  | AudioLoudness;

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
