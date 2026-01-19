/**
 * Golden Tests: NoteTrackingStabilizer
 *
 * Tests the RawInputFrame → MusicalFrame boundary.
 * Verifies that MIDI events produce correct musical abstractions.
 */

import { describe, it, beforeEach } from "vitest";
import { loadFixture, assertOrUpdate, type Fixture } from "../harness";
import type { RawInputFrame, MusicalFrame } from "@synesthetica/contracts";
import { NoteTrackingStabilizer } from "../../../src/stabilizers/NoteTrackingStabilizer";

type StabilizerFixture = Fixture<RawInputFrame, MusicalFrame>;

describe("NoteTrackingStabilizer golden tests", () => {
  let stabilizer: NoteTrackingStabilizer;

  beforeEach(() => {
    stabilizer = new NoteTrackingStabilizer({ partId: "default" });
    stabilizer.init();
  });

  it("basic-note: single note_on produces attack phase note", () => {
    const fixturePath = "stabilizer/note-tracking/basic-note.json";
    const fixture = loadFixture<StabilizerFixture>(fixturePath);

    const actual = stabilizer.apply(fixture.input, null);

    assertOrUpdate(fixturePath, fixture, actual, { floatTolerance: 1e-10 });
  });
});
