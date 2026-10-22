/**
 * Golden Tests: NoteTrackingStabilizer
 *
 * Tests the RawInputFrame → MusicalFrame boundary: the shape of the
 * frame a note_on produces (basic-note.json), and sequence cases the
 * unit tests in NoteTrackingStabilizer.test.ts don't cover (a MIDI
 * note_off with no matching note_on). Lifecycle, phase, release-window
 * and re-trigger behaviour live in the unit tests.
 */

import { describe, it, beforeEach } from "vitest";
import {
  loadFixture,
  loadFixturesFromDir,
  expectFrameEquals,
  type Fixture,
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
}

type StabilizerSequenceFixture = SequenceFixture<RawInputFrame, ExpectedOutput>;

/**
 * Compare actual MusicalFrame against expected output.
 * Extracts relevant fields and compares note properties we care about.
 */
function expectOutputMatches(actual: MusicalFrame, expected: ExpectedOutput): void {
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
          // Omit unset keys: the stabilizer spreads config over its
          // defaults, so an explicit `undefined` would erase them.
          ...(config?.attackDurationMs !== undefined && { attackDurationMs: config.attackDurationMs }),
          ...(config?.releaseWindowMs !== undefined && { releaseWindowMs: config.releaseWindowMs }),
        });
        stabilizer.init();
      });

      it(fixture.description, () => {
        let previous: MusicalFrame | null = null;

        for (const step of fixture.steps) {
          const actual = stabilizer.apply(step.input, previous);

          try {
            expectOutputMatches(actual, step.expected);
          } catch (e) {
            throw new Error(
              `Step t=${step.t} failed: ${e instanceof Error ? e.message : String(e)}`,
              { cause: e },
            );
          }

          previous = actual;
        }
      });
    });
  }

  // Contract shape of the MusicalFrame a single note_on produces.
  // Provenance (source/stream/version) is not part of the claim.
  it("basic-note: single note_on produces attack phase note", () => {
    const fixture = loadFixture<Fixture<RawInputFrame, MusicalFrame>>(
      "stabilizer/note-tracking/basic-note.json"
    );
    const stabilizer = new NoteTrackingStabilizer({ partId: "default" });
    stabilizer.init();

    const actual = stabilizer.apply(fixture.input, null);
    expectFrameEquals(actual, fixture.expected, {
      floatTolerance: 1e-10,
      ignoreFields: ["provenance"],
    });
  });
});
