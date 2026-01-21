/**
 * Golden Tests: NoteTrackingStabilizer
 *
 * Tests the RawInputFrame → MusicalFrame boundary.
 * Verifies that MIDI events produce correct musical abstractions.
 */

import { describe, it, beforeEach } from "vitest";
import {
  loadFixture,
  loadFixturesFromDir,
  expectFrameEquals,
  type SequenceFixture,
} from "../../_harness/golden";
import type { RawInputFrame, MusicalFrame, Pitch, NotePhase } from "@synesthetica/contracts";
import { NoteTrackingStabilizer } from "../../../src/stabilizers/NoteTrackingStabilizer";

/**
 * Expected note state in fixtures (subset of full Note for readability).
 */
interface ExpectedNote {
  pitch: Pitch;
  phase: NotePhase;
  velocity: number;
}

/**
 * Expected output in sequence fixtures.
 */
interface ExpectedOutput {
  noteCount: number;
  notes: ExpectedNote[];
  dynamics: { level: number; trend: string };
}

type StabilizerSequenceFixture = SequenceFixture<RawInputFrame, ExpectedOutput>;

/**
 * Compare actual MusicalFrame against expected output.
 * Extracts relevant fields and compares note properties we care about.
 */
function compareOutput(actual: MusicalFrame, expected: ExpectedOutput): void {
  // Check note count
  if (actual.notes.length !== expected.noteCount) {
    throw new Error(
      `Note count mismatch: expected ${expected.noteCount}, got ${actual.notes.length}\n` +
      `Actual notes: ${JSON.stringify(actual.notes.map(n => ({ pitch: n.pitch, phase: n.phase })), null, 2)}`
    );
  }

  // Check each expected note exists with correct properties
  for (const expectedNote of expected.notes) {
    const match = actual.notes.find(
      n =>
        n.pitch.pc === expectedNote.pitch.pc &&
        n.pitch.octave === expectedNote.pitch.octave &&
        n.velocity === expectedNote.velocity
    );

    if (!match) {
      throw new Error(
        `Expected note not found: ${JSON.stringify(expectedNote)}\n` +
        `Actual notes: ${JSON.stringify(actual.notes.map(n => ({ pitch: n.pitch, phase: n.phase, velocity: n.velocity })), null, 2)}`
      );
    }

    if (match.phase !== expectedNote.phase) {
      throw new Error(
        `Phase mismatch for note ${JSON.stringify(expectedNote.pitch)}: ` +
        `expected "${expectedNote.phase}", got "${match.phase}"`
      );
    }
  }

  // Check dynamics
  expectFrameEquals(actual.dynamics, expected.dynamics, { floatTolerance: 1e-10 });
}

describe("NoteTrackingStabilizer golden tests", () => {
  // Load all sequence fixtures
  const fixtures = loadFixturesFromDir<StabilizerSequenceFixture>(
    "stabilizer/note-tracking"
  ).filter(f => f.steps !== undefined); // Filter to sequence fixtures only

  for (const fixture of fixtures) {
    describe(fixture.name, () => {
      let stabilizer: NoteTrackingStabilizer;

      beforeEach(() => {
        const config = fixture.config as { partId: string; attackDurationMs?: number; releaseWindowMs?: number } | undefined;
        stabilizer = new NoteTrackingStabilizer({
          partId: config?.partId ?? "default",
          attackDurationMs: config?.attackDurationMs,
          releaseWindowMs: config?.releaseWindowMs,
        });
        stabilizer.init();
      });

      it(fixture.description, () => {
        let previous: MusicalFrame | null = null;

        for (const step of fixture.steps) {
          const actual = stabilizer.apply(step.input, previous);

          try {
            compareOutput(actual, step.expected);
          } catch (e) {
            throw new Error(
              `Step t=${step.t} failed: ${e instanceof Error ? e.message : e}`
            );
          }

          previous = actual;
        }
      });
    });
  }

  // Keep the single-frame test for basic smoke testing
  it("basic-note: single note_on produces attack phase note", () => {
    const fixture = loadFixture<{ description: string; input: RawInputFrame; expected: MusicalFrame }>(
      "stabilizer/note-tracking/basic-note.json"
    );
    const stabilizer = new NoteTrackingStabilizer({ partId: "default" });
    stabilizer.init();

    const actual = stabilizer.apply(fixture.input, null);
    expectFrameEquals(actual, fixture.expected, { floatTolerance: 1e-10 });
  });
});
