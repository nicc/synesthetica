/**
 * Test Rhythm Grammar (RFC 006)
 *
 * A rhythm-focused grammar that emphasizes beats and note timing.
 * Renders notes as timing indicators on a horizontal timeline.
 * Largely ignores harmonic content (chords).
 *
 * Visual strategy:
 * - Beat pulses as vertical lines that flash on downbeats
 * - Notes as small markers positioned by their timing relative to beats
 * - Uses palette from annotations for coloring, ignores texture
 *
 * This grammar demonstrates:
 * - Filtering: ignores chords entirely
 * - Interpretation: notes become timing markers, not particles
 * - Palette respect: uses annotation colors while choosing its own shapes
 */

import type {
  AnnotatedMusicalFrame,
  IVisualGrammar,
  GrammarContext,
  SceneFrame,
  Entity,
  EntityId,
  AnnotatedNote,
  AnnotatedBeat,
} from "@synesthetica/contracts";

/**
 * Internal state for tracking entities across frames.
 */
interface RhythmGrammarState {
  /** Active note markers */
  noteMarkers: Map<string, Entity>;

  /** Beat pulse entity (reused) */
  beatPulse: Entity | null;

  /** Entity ID counter */
  nextId: number;
}

export class TestRhythmGrammar implements IVisualGrammar {
  readonly id = "test-rhythm-grammar";

  private state: RhythmGrammarState = {
    noteMarkers: new Map(),
    beatPulse: null,
    nextId: 0,
  };

  init(_ctx: GrammarContext): void {
    this.state = {
      noteMarkers: new Map(),
      beatPulse: null,
      nextId: 0,
    };
  }

  dispose(): void {
    this.state.noteMarkers.clear();
    this.state.beatPulse = null;
  }

  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;

    // 1. Render beat pulse (center of screen, vertical line that flashes)
    if (input.beat) {
      const beatEntity = this.createBeatPulse(input.beat, t, part);
      entities.push(beatEntity);
    }

    // 2. Render notes as timing markers on a horizontal timeline
    // Track which notes we've seen this frame
    const seenNoteIds = new Set<string>();

    for (const annotatedNote of input.notes) {
      seenNoteIds.add(annotatedNote.note.id);

      // Create or update marker
      const marker = this.createNoteMarker(annotatedNote, t, part);
      this.state.noteMarkers.set(annotatedNote.note.id, marker);
      entities.push(marker);
    }

    // 3. Remove markers for notes that are no longer present
    for (const [noteId] of this.state.noteMarkers) {
      if (!seenNoteIds.has(noteId)) {
        // Note is gone - could add fade-out logic here
        // For now, just remove immediately
        this.state.noteMarkers.delete(noteId);
      }
    }

    // Note: We completely ignore input.chords - this grammar doesn't care about harmony

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  /**
   * Create a beat pulse entity.
   * Vertical line at center that flashes more intensely on downbeats.
   */
  private createBeatPulse(annotatedBeat: AnnotatedBeat, t: number, part: string): Entity {
    const pulseIntensity = annotatedBeat.visual.motion.pulse;
    const { phase, beatInBar, isDownbeat } = annotatedBeat.beat;

    // Downbeats are brighter and wider
    const opacity = isDownbeat ? 0.9 : 0.4 + pulseIntensity * 0.4;
    const size = isDownbeat ? 8 : 4 + pulseIntensity * 4;

    return {
      id: this.entityId("beat-pulse"),
      part,
      kind: "field",
      createdAt: t,
      updatedAt: t,
      position: { x: 0.5, y: 0.5 }, // Center
      style: {
        color: annotatedBeat.visual.palette.primary,
        size,
        opacity,
      },
      data: {
        type: "beat-pulse",
        beatInBar,
        isDownbeat,
        phase,
      },
    };
  }

  /**
   * Create a note timing marker.
   * Positioned horizontally based on note onset time (relative to recent window).
   * Height based on pitch octave, color from annotation palette.
   */
  private createNoteMarker(an: AnnotatedNote, t: number, part: string): Entity {
    const note = an.note;
    const visual = an.visual;

    // Horizontal position: map onset time to 0-1 range
    // Use a 2-second window for visualization
    const windowMs = 2000;
    const relativeTime = t - note.onset;
    const x = 1 - Math.min(relativeTime / windowMs, 1); // Recent notes on right

    // Vertical position: based on octave (higher octaves = higher on screen)
    const octaveRange = 8; // Assume octaves 0-7
    const y = 1 - (note.pitch.octave + 0.5) / octaveRange;

    // Size based on velocity
    const size = 4 + (note.velocity / 127) * 8;

    // Opacity based on phase and motion jitter
    let opacity: number;
    switch (note.phase) {
      case "attack":
        opacity = 1.0;
        break;
      case "sustain":
        opacity = 0.8;
        break;
      case "release":
        opacity = 0.4;
        break;
    }

    // Apply jitter from motion annotation as slight random offset
    const jitterAmount = visual.motion.jitter * 0.02;
    const jitterX = (Math.random() - 0.5) * jitterAmount;
    const jitterY = (Math.random() - 0.5) * jitterAmount;

    return {
      id: this.entityId(`note-${note.id}`),
      part,
      kind: "particle",
      createdAt: note.onset,
      updatedAt: t,
      position: { x: x + jitterX, y: y + jitterY },
      style: {
        color: visual.palette.primary,
        size,
        opacity,
      },
      data: {
        type: "timing-marker",
        noteId: note.id,
        phase: note.phase,
        label: visual.label,
      },
    };
  }

  private entityId(base: string): EntityId {
    return `${this.id}:${base}:${this.state.nextId++}`;
  }
}
