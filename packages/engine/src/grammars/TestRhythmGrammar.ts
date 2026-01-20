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
  AnnotatedRhythm,
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

    // 1. Render rhythm visualization
    // Only show beat-relative visuals when prescribedTempo is set
    if (input.rhythm.prescribedTempo !== null) {
      const rhythmEntity = this.createRhythmPulse(input.rhythm, t, part);
      entities.push(rhythmEntity);
    } else if (input.rhythm.analysis.detectedDivision !== null) {
      // Show historic-only visualization when no prescribed tempo
      const divisionEntity = this.createDivisionIndicator(input.rhythm, t, part);
      entities.push(divisionEntity);
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
   * Create a rhythm pulse entity when prescribedTempo is set.
   * Uses the prescribed tempo to show beat-relative visualization.
   */
  private createRhythmPulse(rhythm: AnnotatedRhythm, t: number, part: string): Entity {
    const { analysis, prescribedTempo, prescribedMeter } = rhythm;
    const pulseIntensity = rhythm.visual.motion.pulse;

    // Calculate phase within the beat based on prescribed tempo
    const beatDurationMs = 60000 / prescribedTempo!;
    const referenceOnset = analysis.referenceOnset ?? t;
    const timeSinceReference = t - referenceOnset;
    const phase = (timeSinceReference % beatDurationMs) / beatDurationMs;

    // Determine if this is a downbeat (requires meter)
    let isDownbeat = false;
    if (prescribedMeter !== null && analysis.referenceOnset !== null) {
      const beatsFromReference = Math.floor(timeSinceReference / beatDurationMs);
      isDownbeat = beatsFromReference % prescribedMeter.beatsPerBar === 0;
    }

    // Pulse strongest at beat start (low phase)
    const phasePulse = 1 - phase;
    const baseOpacity = isDownbeat ? 0.9 : 0.5;
    const opacity = baseOpacity * phasePulse * pulseIntensity;
    const size = (isDownbeat ? 150 : 80) * phasePulse;

    return {
      id: this.entityId("rhythm-pulse"),
      part,
      kind: "field",
      createdAt: t,
      updatedAt: t,
      position: { x: 0.5, y: 0.5 }, // Center
      style: {
        color: rhythm.visual.palette.primary,
        size,
        opacity,
      },
      data: {
        type: "rhythm-pulse",
        phase,
        isDownbeat,
        prescribedTempo,
        detectedDivision: analysis.detectedDivision,
      },
    };
  }

  /**
   * Create a division indicator for historic-only visualization.
   * Shows the detected division pattern without beat-relative assumptions.
   */
  private createDivisionIndicator(rhythm: AnnotatedRhythm, t: number, part: string): Entity {
    const { analysis } = rhythm;
    const pulseIntensity = rhythm.visual.motion.pulse;

    // Use stability to modulate the visualization
    const stability = analysis.stability;
    const confidence = analysis.confidence;

    // Size based on stability (more stable = larger, more confident pulse)
    const size = 60 + stability * 40;
    const opacity = 0.3 + confidence * 0.5;

    return {
      id: this.entityId("division-indicator"),
      part,
      kind: "field",
      createdAt: t,
      updatedAt: t,
      position: { x: 0.5, y: 0.5 }, // Center
      style: {
        color: rhythm.visual.palette.primary,
        size: size * pulseIntensity,
        opacity,
      },
      data: {
        type: "division-indicator",
        detectedDivision: analysis.detectedDivision,
        stability,
        confidence,
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
