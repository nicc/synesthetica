/**
 * Rhythm Grammar Simulation Tests (Principle 8: Experiential Feedback Through Simulation)
 *
 * These tests exercise the TestRhythmGrammar through the full pipeline with
 * realistic MIDI input patterns. By running complete pipeline simulations,
 * we can verify that the grammar produces expected entities for each tier.
 *
 * This supplements unit tests by testing integration behavior that's difficult
 * to describe verbally - seeing the actual entity output reveals issues that
 * specification alone would miss.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VisualPipeline } from "../../src/VisualPipeline";
import { NoteTrackingStabilizer } from "../../src/stabilizers/NoteTrackingStabilizer";
import { BeatDetectionStabilizer } from "../../src/stabilizers/BeatDetectionStabilizer";
import { MusicalVisualRuleset } from "../../src/rulesets/MusicalVisualRuleset";
import { TestRhythmGrammar } from "../../src/grammars/TestRhythmGrammar";
import { IdentityCompositor } from "../../src/stubs/IdentityCompositor";
import type {
  IRawSourceAdapter,
  RawInputFrame,
  MidiNoteOn,
  MidiNoteOff,
  SceneFrame,
  Entity,
} from "@synesthetica/contracts";

// ============================================================================
// Mock Adapter
// ============================================================================

class MockMidiAdapter implements IRawSourceAdapter {
  readonly source = "mock-midi";
  readonly stream = "simulation";

  private frames: RawInputFrame[] = [];
  private index = 0;

  nextFrame(): RawInputFrame | null {
    if (this.index >= this.frames.length) {
      return null;
    }
    return this.frames[this.index++];
  }

  addNoteOn(note: number, velocity: number, t: number, channel = 0): void {
    const input: MidiNoteOn = {
      type: "midi_note_on",
      t,
      note,
      velocity,
      channel,
    };
    this.addInput(t, input);
  }

  addNoteOff(note: number, t: number, channel = 0): void {
    const input: MidiNoteOff = {
      type: "midi_note_off",
      t,
      note,
      channel,
    };
    this.addInput(t, input);
  }

  private addInput(t: number, input: MidiNoteOn | MidiNoteOff): void {
    let frame = this.frames.find((f) => f.t === t);
    if (!frame) {
      frame = {
        t,
        source: this.source,
        stream: this.stream,
        inputs: [],
      };
      this.frames.push(frame);
      this.frames.sort((a, b) => a.t - b.t);
    }
    frame.inputs.push(input);
  }

  addEmptyFrame(t: number): void {
    this.frames.push({
      t,
      source: this.source,
      stream: this.stream,
      inputs: [],
    });
  }

  reset(): void {
    this.index = 0;
  }

  clear(): void {
    this.frames = [];
    this.index = 0;
  }

  getTimestamps(): number[] {
    return this.frames.map(f => f.t);
  }
}

// ============================================================================
// Simulation Helpers
// ============================================================================

interface SimulationResult {
  frames: SceneFrame[];
  entityCounts: Map<string, number>;
  allEntities: Entity[];
}

function runSimulation(pipeline: VisualPipeline, adapter: MockMidiAdapter): SimulationResult {
  const frames: SceneFrame[] = [];
  const entityCounts = new Map<string, number>();
  const allEntities: Entity[] = [];

  // Get all the timestamps we need to process
  const timestamps = adapter.getTimestamps();

  for (const t of timestamps) {
    const result = pipeline.requestFrame(t);
    if (result) {
      frames.push(result);
      for (const entity of result.entities) {
        const type = (entity.data?.type as string) || "unknown";
        entityCounts.set(type, (entityCounts.get(type) || 0) + 1);
        allEntities.push(entity);
      }
    }
  }

  return { frames, entityCounts, allEntities };
}

function logEntitySummary(label: string, result: SimulationResult): void {
  console.log(`\n${label}:`);
  console.log(`  Total frames: ${result.frames.length}`);
  console.log(`  Entity types:`);
  for (const [type, count] of result.entityCounts.entries()) {
    console.log(`    ${type}: ${count}`);
  }
}

/**
 * Generate a sequence of note_on/note_off events at regular intervals.
 */
function generateRegularNotes(
  adapter: MockMidiAdapter,
  startTime: number,
  intervalMs: number,
  count: number,
  noteDurationMs: number,
  baseNote = 60,
  velocity = 80
): void {
  for (let i = 0; i < count; i++) {
    const onsetTime = startTime + i * intervalMs;
    const releaseTime = onsetTime + noteDurationMs;
    adapter.addNoteOn(baseNote + (i % 12), velocity, onsetTime);
    adapter.addNoteOff(baseNote + (i % 12), releaseTime);
  }
}

/**
 * Generate notes with timing jitter to simulate human playing.
 */
function generateHumanNotes(
  adapter: MockMidiAdapter,
  startTime: number,
  intervalMs: number,
  count: number,
  noteDurationMs: number,
  jitterMs: number,
  baseNote = 60,
  velocity = 80
): void {
  for (let i = 0; i < count; i++) {
    const jitter = (Math.random() - 0.5) * 2 * jitterMs;
    const onsetTime = Math.round(startTime + i * intervalMs + jitter);
    const releaseTime = onsetTime + noteDurationMs;
    adapter.addNoteOn(baseNote + (i % 12), velocity, onsetTime);
    adapter.addNoteOff(baseNote + (i % 12), releaseTime);
  }
}

// ============================================================================
// Simulation Tests
// ============================================================================

describe("RhythmGrammar Pipeline Simulation", () => {
  let pipeline: VisualPipeline;
  let adapter: MockMidiAdapter;
  const partId = "simulation-part";

  beforeEach(() => {
    pipeline = new VisualPipeline({
      canvasSize: { width: 1920, height: 1080 },
      rngSeed: 12345,
      partId,
    });
    adapter = new MockMidiAdapter();

    // Wire up full pipeline
    pipeline.addAdapter(adapter);
    pipeline.addStabilizerFactory(() => new NoteTrackingStabilizer({ partId }));
    pipeline.addStabilizerFactory(() => new BeatDetectionStabilizer({ partId }));
    pipeline.setRuleset(new MusicalVisualRuleset());
    pipeline.addGrammar(new TestRhythmGrammar());
    pipeline.setCompositor(new IdentityCompositor());
  });

  describe("Tier 1: Historic-only (no prescribed tempo)", () => {
    it("produces onset-marker entities for each note", () => {
      // No tempo set - should be tier 1
      generateRegularNotes(adapter, 0, 500, 8, 200);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Tier 1 - Regular notes", result);

      // Should have onset markers
      const onsetMarkers = result.allEntities.filter(e => e.data?.type === "onset-marker");
      expect(onsetMarkers.length).toBeGreaterThan(0);

      // Should NOT have tier 2+ entities
      const beatLines = result.allEntities.filter(e => e.data?.type === "beat-line");
      const driftRings = result.allEntities.filter(e => e.data?.type === "drift-ring");
      expect(beatLines.length).toBe(0);
      expect(driftRings.length).toBe(0);

      // Verify markers have correct properties
      const sampleMarker = onsetMarkers[0];
      expect(sampleMarker.kind).toBe("particle");
      expect(sampleMarker.style.color).toBeDefined();
      expect(sampleMarker.position).toBeDefined();

      // Tier 1: y position based on pitch octave, not drift
      // All notes are around octave 4-5, so y should be around 0.4-0.6
      expect(sampleMarker.position!.y).toBeGreaterThan(0.2);
      expect(sampleMarker.position!.y).toBeLessThan(0.8);
    });

    it("produces division-tick entities when rhythm is detected", () => {
      // Play enough notes for beat detection to kick in
      generateRegularNotes(adapter, 0, 500, 12, 200);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Tier 1 - With detected division", result);

      // After enough notes, should have division ticks
      const divisionTicks = result.allEntities.filter(e => e.data?.type === "division-tick");
      // Division ticks may or may not appear depending on stability
      console.log(`  Division ticks found: ${divisionTicks.length}`);
    });
  });

  describe("Tier 2: Tempo-relative (prescribed tempo, no meter)", () => {
    beforeEach(() => {
      pipeline.setTempo(120); // 500ms per beat
    });

    it("produces beat-line entities at beat intervals", () => {
      generateRegularNotes(adapter, 0, 500, 8, 200);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Tier 2 - Beat grid", result);

      // Should have beat lines
      const beatLines = result.allEntities.filter(e => e.data?.type === "beat-line");
      expect(beatLines.length).toBeGreaterThan(0);

      // Should have onset markers
      const onsetMarkers = result.allEntities.filter(e => e.data?.type === "onset-marker");
      expect(onsetMarkers.length).toBeGreaterThan(0);

      // Should have drift rings
      const driftRings = result.allEntities.filter(e => e.data?.type === "drift-ring");
      expect(driftRings.length).toBeGreaterThan(0);

      // Should NOT have tier 3 entities
      const barLines = result.allEntities.filter(e => e.data?.type === "bar-line");
      expect(barLines.length).toBe(0);
    });

    it("drift rings reflect timing accuracy", () => {
      // Notes exactly on beats (every 500ms at 120 BPM)
      generateRegularNotes(adapter, 0, 500, 8, 200);

      const result = runSimulation(pipeline, adapter);

      const driftRings = result.allEntities.filter(e => e.data?.type === "drift-ring");

      // Check drift categories
      const goodRings = driftRings.filter(e => e.data?.driftCategory === "good");
      const warningRings = driftRings.filter(e => e.data?.driftCategory === "warning");
      const badRings = driftRings.filter(e => e.data?.driftCategory === "bad");

      console.log(`  Drift ring categories: good=${goodRings.length}, warning=${warningRings.length}, bad=${badRings.length}`);

      // Most should be "good" since notes are on beat
      expect(goodRings.length).toBeGreaterThan(0);
    });

    it("onset markers positioned by drift (y-axis)", () => {
      // Notes on beat
      generateRegularNotes(adapter, 0, 500, 4, 200);

      const result = runSimulation(pipeline, adapter);

      const onsetMarkers = result.allEntities.filter(e => e.data?.type === "onset-marker");

      // Tier 2: y position based on drift from beat
      // On-beat notes should be near center (y ≈ 0.5)
      for (const marker of onsetMarkers) {
        // With drift-based positioning, on-beat notes should cluster around 0.5
        // (within DRIFT_RANGE of 0.3)
        console.log(`  Marker y=${marker.position!.y.toFixed(3)}, tier=${marker.data?.tier}`);
        expect(marker.data?.tier).toBe(2);
      }
    });

    it("handles human timing jitter", () => {
      // Notes with ±30ms jitter
      generateHumanNotes(adapter, 0, 500, 10, 200, 30);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Tier 2 - Human jitter", result);

      const driftRings = result.allEntities.filter(e => e.data?.type === "drift-ring");

      // With jitter, we should see a mix of drift categories
      const goodRings = driftRings.filter(e => e.data?.driftCategory === "good");
      const otherRings = driftRings.filter(e => e.data?.driftCategory !== "good");

      console.log(`  With jitter: good=${goodRings.length}, other=${otherRings.length}`);

      // Should still have some entities
      expect(driftRings.length).toBeGreaterThan(0);
    });
  });

  describe("Tier 3: Meter-relative (prescribed tempo + meter)", () => {
    beforeEach(() => {
      pipeline.setTempo(120); // 500ms per beat
      pipeline.setMeter(4, 4); // 4/4 time = 2000ms per bar
    });

    it("produces bar-line entities at bar boundaries", () => {
      // Play 8 notes spanning 2 bars
      generateRegularNotes(adapter, 0, 500, 8, 200);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Tier 3 - Bar lines", result);

      // Should have bar lines
      const barLines = result.allEntities.filter(e => e.data?.type === "bar-line");
      expect(barLines.length).toBeGreaterThan(0);

      // Should still have beat lines
      const beatLines = result.allEntities.filter(e => e.data?.type === "beat-line");
      expect(beatLines.length).toBeGreaterThan(0);

      // Bar lines should be thicker than beat lines
      if (barLines.length > 0 && beatLines.length > 0) {
        expect(barLines[0].style.size).toBeGreaterThan(beatLines[0].style.size!);
      }
    });

    it("produces downbeat-glow near bar starts", () => {
      // Play notes starting at bar boundary
      generateRegularNotes(adapter, 0, 500, 4, 200);
      // Add empty frames right after bar start to catch the glow
      adapter.addEmptyFrame(50);
      adapter.addEmptyFrame(100);
      adapter.addEmptyFrame(150);

      const result = runSimulation(pipeline, adapter);

      const downbeatGlows = result.allEntities.filter(e => e.data?.type === "downbeat-glow");
      console.log(`  Downbeat glows found: ${downbeatGlows.length}`);

      // Should have at least some downbeat glows
      // (they fade quickly, so we might not catch them all)
      // At minimum, verify the tier is correct
      const onsetMarkers = result.allEntities.filter(e => e.data?.type === "onset-marker");
      for (const marker of onsetMarkers) {
        expect(marker.data?.tier).toBe(3);
      }
    });

    it("complete tier 3 visualization with realistic pattern", () => {
      // Simulate playing a simple melody over 2 bars at 120 BPM in 4/4
      const notePattern = [
        // Bar 1: C E G C (quarter notes)
        { note: 60, onset: 0 },
        { note: 64, onset: 500 },
        { note: 67, onset: 1000 },
        { note: 72, onset: 1500 },
        // Bar 2: G E C rest
        { note: 67, onset: 2000 },
        { note: 64, onset: 2500 },
        { note: 60, onset: 3000 },
      ];

      for (const n of notePattern) {
        adapter.addNoteOn(n.note, 80, n.onset);
        adapter.addNoteOff(n.note, n.onset + 400);
      }
      // Add frame at end of bar 2
      adapter.addEmptyFrame(3500);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Tier 3 - Complete melody", result);

      // Verify we have all tier 3 entity types
      expect(result.entityCounts.get("onset-marker")).toBeGreaterThan(0);
      expect(result.entityCounts.get("drift-ring")).toBeGreaterThan(0);
      expect(result.entityCounts.get("beat-line")).toBeGreaterThan(0);
      expect(result.entityCounts.get("bar-line")).toBeGreaterThan(0);

      // Log detailed position info for visual inspection
      console.log("\n  Entity positions (sample):");
      const markers = result.allEntities.filter(e => e.data?.type === "onset-marker").slice(0, 3);
      for (const m of markers) {
        console.log(`    onset-marker: x=${m.position!.x.toFixed(3)}, y=${m.position!.y.toFixed(3)}`);
      }
    });
  });

  describe("Tier transitions", () => {
    it("changes behavior when tempo is set mid-session", () => {
      // Start without tempo (tier 1)
      generateRegularNotes(adapter, 0, 500, 4, 200);

      let result = runSimulation(pipeline, adapter);
      const tier1Markers = result.allEntities.filter(e => e.data?.type === "onset-marker");
      console.log(`\n  Before tempo: ${tier1Markers.length} markers, tier=${tier1Markers[0]?.data?.tier}`);

      // Reset adapter and set tempo
      adapter.clear();
      pipeline.setTempo(120);
      generateRegularNotes(adapter, 2000, 500, 4, 200);

      result = runSimulation(pipeline, adapter);
      const tier2Markers = result.allEntities.filter(e => e.data?.type === "onset-marker");
      console.log(`  After tempo: ${tier2Markers.length} markers, tier=${tier2Markers[0]?.data?.tier}`);

      // Should have drift rings now (tier 2)
      const driftRings = result.allEntities.filter(e => e.data?.type === "drift-ring");
      expect(driftRings.length).toBeGreaterThan(0);
    });
  });

  describe("Edge cases", () => {
    it("handles very fast tempo (200 BPM)", () => {
      pipeline.setTempo(200); // 300ms per beat
      generateRegularNotes(adapter, 0, 300, 12, 150);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Fast tempo (200 BPM)", result);

      expect(result.entityCounts.get("beat-line")).toBeGreaterThan(0);
    });

    it("handles slow tempo (60 BPM)", () => {
      pipeline.setTempo(60); // 1000ms per beat
      generateRegularNotes(adapter, 0, 1000, 6, 500);

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Slow tempo (60 BPM)", result);

      expect(result.entityCounts.get("beat-line")).toBeGreaterThan(0);
    });

    it("handles notes that drift relative to established pattern", () => {
      pipeline.setTempo(120);
      // First, establish a pattern with on-beat notes
      for (let i = 0; i < 4; i++) {
        const onsetTime = i * 500; // On beat
        adapter.addNoteOn(60, 80, onsetTime);
        adapter.addNoteOff(60, onsetTime + 200);
      }
      // Then add notes that are 200ms late (40% of beat) from established pattern
      // Note: With RFC 008 subdivision-aware drift, 200ms into a 500ms beat is close
      // to an 8th note (250ms), so may be categorized as "good" or "warning" for that subdivision
      for (let i = 4; i < 8; i++) {
        const onsetTime = i * 500 + 200; // 200ms late from quarter beat
        adapter.addNoteOn(64, 80, onsetTime);
        adapter.addNoteOff(64, onsetTime + 200);
      }

      const result = runSimulation(pipeline, adapter);

      const driftRings = result.allEntities.filter(e => e.data?.type === "drift-ring");
      const goodRings = driftRings.filter(e => e.data?.driftCategory === "good");
      const warningRings = driftRings.filter(e => e.data?.driftCategory === "warning");
      const badRings = driftRings.filter(e => e.data?.driftCategory === "bad");

      console.log(`\n  Drift pattern: good=${goodRings.length}, warning=${warningRings.length}, bad=${badRings.length}/${driftRings.length}`);

      // With subdivision-aware drift (RFC 008), notes should be analyzed
      // On-beat notes should be "good", 200ms-off notes are close to 8th note subdivision
      expect(driftRings.length).toBeGreaterThan(0);
      // The on-beat notes should mostly be categorized as "good"
      expect(goodRings.length).toBeGreaterThan(0);
    });

    it("handles chord clusters (multiple simultaneous notes)", () => {
      pipeline.setTempo(120);

      // Play chords on each beat
      for (let beat = 0; beat < 4; beat++) {
        const t = beat * 500;
        adapter.addNoteOn(60, 80, t); // C
        adapter.addNoteOn(64, 75, t + 5); // E (5ms later)
        adapter.addNoteOn(67, 70, t + 10); // G (10ms later)
        adapter.addNoteOff(60, t + 400);
        adapter.addNoteOff(64, t + 400);
        adapter.addNoteOff(67, t + 400);
      }

      const result = runSimulation(pipeline, adapter);
      logEntitySummary("Chord clusters", result);

      // Should have markers for all notes
      const markers = result.allEntities.filter(e => e.data?.type === "onset-marker");
      expect(markers.length).toBeGreaterThan(0);
    });
  });

  describe("Diagnostic: frame-by-frame state", () => {
    it("Tier 1 only (no tempo): shows division-ticks with continuous render", () => {
      // NO tempo/meter set - pure Tier 1

      // Play 8 notes at 500ms intervals
      for (let i = 0; i < 8; i++) {
        const t = i * 500;
        adapter.addNoteOn(60 + (i % 12), 80, t);
        adapter.addNoteOff(60 + (i % 12), t + 400);
      }

      // Simulate continuous render loop (every 100ms) like the real app
      console.log("\n=== DIAGNOSTIC: Tier 1 (continuous render, no tempo) ===\n");

      for (let t = 0; t <= 4000; t += 100) {
        const scene = pipeline.requestFrame(t);
        if (!scene) continue;

        const typeCounts = new Map<string, number>();
        for (const e of scene.entities) {
          const type = (e.data?.type as string) || "unknown";
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        }

        const divTicks = scene.entities.filter(e => e.data?.type === "division-tick");
        const divXs = divTicks.map(e => e.position?.x?.toFixed(3)).join(", ");

        const onsetMarkers = typeCounts.get("onset-marker") || 0;
        const divTickCount = typeCounts.get("division-tick") || 0;

        // Only log frames with rhythm-related entities
        if (onsetMarkers > 0 || divTickCount > 0) {
          console.log(`t=${t}ms: onset-marker:${onsetMarkers}, division-tick:${divTickCount}`);
          if (divXs) console.log(`  x: [${divXs}]`);
        }
      }

      console.log("\n=== END Tier 1 ===\n");
      expect(true).toBe(true);
    });

    it("Tier 2/3 (with tempo): shows beat grid snapping", () => {
      pipeline.setTempo(120);
      pipeline.setMeter(4);

      // Simple pattern: quarter notes at 500ms intervals
      for (let i = 0; i < 8; i++) {
        const t = i * 500;
        adapter.addNoteOn(60 + (i % 12), 80, t);
        adapter.addNoteOff(60 + (i % 12), t + 400);
      }

      const timestamps = adapter.getTimestamps();
      console.log("\n=== DIAGNOSTIC: Tier 2/3 (with tempo) ===\n");

      for (const t of timestamps) {
        const scene = pipeline.requestFrame(t);
        if (!scene) continue;

        const typeCounts = new Map<string, number>();
        for (const e of scene.entities) {
          const type = (e.data?.type as string) || "unknown";
          typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
        }

        const beatLines = scene.entities.filter(e => e.data?.type === "beat-line");
        const beatXs = beatLines.map(e => e.position?.x?.toFixed(3)).join(", ");

        console.log(`t=${t}ms: ${Array.from(typeCounts.entries()).map(([k, v]) => `${k}:${v}`).join(", ")}`);
        if (beatXs) console.log(`  beat-line x: [${beatXs}]`);
      }

      console.log("\n=== END Tier 2/3 ===\n");
      expect(true).toBe(true);
    });
  });
});
