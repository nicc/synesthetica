/**
 * QWERTY → piano note mapping for the on-screen keyboard.
 *
 * Two rows across the physical keyboard, piano-style:
 *   - Z row = naturals (white keys), left-to-right = C4 → E5.
 *   - A row = sharps (black keys), each positioned above the natural
 *     it sharps. Physical keys where no sharp exists (A, F, K on the
 *     A row) are intentionally UNMAPPED so the on-screen keyboard
 *     draws piano's natural gaps between E-F and B-C.
 *
 * Range: C4 (60) → E5 (76). Roughly 1.5 octaves — the practical
 * span of a single computer-keyboard row without reaching into the
 * number row or awkwardly stretching to `[`, `]`, `\`.
 *
 * Fixed velocity: computer key events have no pressure information,
 * so every note-on lands at KEYBOARD_VELOCITY. Set mid-range so
 * downstream stabilizers don't visually flatline (which would
 * happen at maximum velocity) or read as ghosts (near zero).
 */
export const KEYBOARD_VELOCITY = 80;

export interface KeyMapEntry {
  /** MIDI note number (60 = C4). */
  midiNote: number;
  /** true for sharps/flats — labels + outlines use the dark scheme. */
  isBlack: boolean;
  /** The natural note this sharp sits above; only present for blacks.
   *  Positions the black-key visual between two whites. */
  sharpsWhichNatural?: string;
}

/**
 * Mapping is expressed with lowercase code fragments matching
 * KeyboardEvent.code values (KeyZ, KeyA, Comma, Period, Slash,
 * Semicolon) so we don't have to normalise event.key against
 * shift / caps-lock / keyboard layout.
 */
export const KEY_MAP: Record<string, KeyMapEntry> = {
  // Z row — white keys (naturals), C4 → E5.
  KeyZ: { midiNote: 60, isBlack: false }, // C4
  KeyX: { midiNote: 62, isBlack: false }, // D4
  KeyC: { midiNote: 64, isBlack: false }, // E4
  KeyV: { midiNote: 65, isBlack: false }, // F4
  KeyB: { midiNote: 67, isBlack: false }, // G4
  KeyN: { midiNote: 69, isBlack: false }, // A4
  KeyM: { midiNote: 71, isBlack: false }, // B4
  Comma: { midiNote: 72, isBlack: false }, // C5
  Period: { midiNote: 74, isBlack: false }, // D5
  Slash: { midiNote: 76, isBlack: false }, // E5

  // A row — black keys (sharps). A, F, K deliberately omitted so
  // the E-F and B-C piano gaps show through as unmapped physical keys.
  KeyS: { midiNote: 61, isBlack: true, sharpsWhichNatural: "KeyZ" }, // C#4
  KeyD: { midiNote: 63, isBlack: true, sharpsWhichNatural: "KeyX" }, // D#4
  KeyG: { midiNote: 66, isBlack: true, sharpsWhichNatural: "KeyV" }, // F#4
  KeyH: { midiNote: 68, isBlack: true, sharpsWhichNatural: "KeyB" }, // G#4
  KeyJ: { midiNote: 70, isBlack: true, sharpsWhichNatural: "KeyN" }, // A#4
  KeyL: { midiNote: 73, isBlack: true, sharpsWhichNatural: "Comma" }, // C#5
  Semicolon: { midiNote: 75, isBlack: true, sharpsWhichNatural: "Period" }, // D#5
};

/** Human-readable label per physical key — appears on the on-screen key face. */
export const KEY_LABEL: Record<string, string> = {
  KeyZ: "Z", KeyX: "X", KeyC: "C", KeyV: "V", KeyB: "B",
  KeyN: "N", KeyM: "M", Comma: ",", Period: ".", Slash: "/",
  KeyS: "S", KeyD: "D", KeyG: "G", KeyH: "H", KeyJ: "J",
  KeyL: "L", Semicolon: ";",
};

/** Ordered natural (white-key) codes, left → right. */
export const NATURAL_ORDER: string[] = [
  "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB",
  "KeyN", "KeyM", "Comma", "Period", "Slash",
];
