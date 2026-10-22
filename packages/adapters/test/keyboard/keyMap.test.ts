import { describe, it, expect } from "vitest";
import {
  KEY_MAP,
  KEY_LABEL,
  NATURAL_ORDER,
  KEYBOARD_VELOCITY,
} from "../../src/keyboard/keyMap";

// Structural properties of the QWERTY piano layout. These hold for any
// range or row choice that still behaves like a piano keyboard, so a
// shift of octave or extra keys at the ends doesn't break them.

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
const pc = (note: number) => ((note % 12) + 12) % 12;
const entries = Object.entries(KEY_MAP);
const whites = entries.filter(([, e]) => !e.isBlack);
const blacks = entries.filter(([, e]) => e.isBlack);

describe("KEY_MAP — piano layout", () => {
  it("NATURAL_ORDER lists exactly the white keys", () => {
    expect([...NATURAL_ORDER].sort()).toEqual(whites.map(([code]) => code).sort());
  });

  it("naturals ascend left to right by a whole or half step, on white pitch classes only", () => {
    const notes = NATURAL_ORDER.map((code) => KEY_MAP[code].midiNote);
    for (let i = 1; i < notes.length; i++) {
      expect([1, 2]).toContain(notes[i] - notes[i - 1]);
    }
    for (const n of notes) expect(WHITE_PCS.has(pc(n))).toBe(true);
    // Half steps fall exactly where a piano has them (E-F, B-C).
    for (let i = 1; i < notes.length; i++) {
      const halfStep = notes[i] - notes[i - 1] === 1;
      expect(halfStep).toBe(pc(notes[i]) === 5 || pc(notes[i]) === 0);
    }
  });

  it("each sharp sits a semitone above its natural and below the next natural", () => {
    for (const [code, e] of blacks) {
      const natural = e.sharpsWhichNatural;
      if (natural === undefined) throw new Error(`${code} is black but names no natural`);
      const idx = NATURAL_ORDER.indexOf(natural);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(e.midiNote).toBe(KEY_MAP[natural].midiNote + 1);
      const next = NATURAL_ORDER[idx + 1];
      expect(next).toBeDefined();
      expect(KEY_MAP[next].midiNote).toBe(e.midiNote + 1);
      expect(WHITE_PCS.has(pc(e.midiNote))).toBe(false);
    }
  });

  it("white keys never carry a sharpsWhichNatural", () => {
    for (const [, e] of whites) expect(e.sharpsWhichNatural).toBeUndefined();
  });

  it("covers every semitone between its lowest and highest note exactly once", () => {
    const notes = entries.map(([, e]) => e.midiNote).sort((a, b) => a - b);
    expect(new Set(notes).size).toBe(notes.length);
    const lo = notes[0];
    expect(notes).toEqual(notes.map((_, i) => lo + i));
  });

  it("is keyed by KeyboardEvent.code values, not produced characters", () => {
    // .code values are words ("KeyZ", "Comma"); .key values are the
    // produced character ("z", ","), which shift and layout change.
    for (const code of Object.keys(KEY_MAP)) {
      expect(code.length).toBeGreaterThan(1);
      expect(code[0]).toBe(code[0].toUpperCase());
    }
  });

  it("uses a fixed velocity inside the MIDI range, short of the maximum", () => {
    expect(KEYBOARD_VELOCITY).toBeGreaterThan(0);
    expect(KEYBOARD_VELOCITY).toBeLessThan(127);
    expect(Number.isInteger(KEYBOARD_VELOCITY)).toBe(true);
  });
});

describe("KEY_LABEL", () => {
  it("labels exactly the mapped keys", () => {
    expect(Object.keys(KEY_LABEL).sort()).toEqual(Object.keys(KEY_MAP).sort());
  });

  it("gives every key a distinct, single-character label", () => {
    const labels = Object.values(KEY_LABEL);
    for (const l of labels) expect(l).toHaveLength(1);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
