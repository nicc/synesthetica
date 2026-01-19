/**
 * Test Chord Progression Grammar (RFC 006)
 *
 * A harmony-focused grammar that emphasizes chord progressions.
 * Renders chords as expanding glows with a history trail.
 * Notes within chords are shown as small particles.
 *
 * Visual strategy:
 * - Active chord as a central radial glow
 * - Chord history as fading bands on the left side
 * - Notes belonging to chords as small particles within the glow
 * - Ignores beat/bar information
 *
 * This grammar demonstrates:
 * - Filtering: ignores beats entirely
 * - History tracking: maintains chord progression trail
 * - Relationship awareness: renders notes that belong to chords differently
 * - Palette respect: uses annotation colors while choosing its own shapes
 */

import type {
  AnnotatedMusicalFrame,
  IVisualGrammar,
  GrammarContext,
  SceneFrame,
  Entity,
  EntityId,
  AnnotatedChord,
  AnnotatedNote,
  Ms,
} from "@synesthetica/contracts";

/**
 * Entry in the chord history trail.
 */
interface ChordHistoryEntry {
  chordId: string;
  label?: string;
  palette: AnnotatedChord["visual"]["palette"];
  onset: Ms;
  fadeStartTime: Ms;
}

/**
 * Internal state for tracking entities across frames.
 */
interface ChordProgressionState {
  /** Chord history for progression trail */
  chordHistory: ChordHistoryEntry[];

  /** Maximum history entries to keep */
  maxHistory: number;

  /** How long chords stay in history (ms) */
  historyWindowMs: Ms;

  /** Entity ID counter */
  nextId: number;
}

export class TestChordProgressionGrammar implements IVisualGrammar {
  readonly id = "test-chord-progression-grammar";

  private state: ChordProgressionState = {
    chordHistory: [],
    maxHistory: 8,
    historyWindowMs: 10000, // 10 seconds of history
    nextId: 0,
  };

  init(_ctx: GrammarContext): void {
    this.state = {
      chordHistory: [],
      maxHistory: 8,
      historyWindowMs: 10000,
      nextId: 0,
    };
  }

  dispose(): void {
    this.state.chordHistory = [];
  }

  update(input: AnnotatedMusicalFrame, _previous: SceneFrame | null): SceneFrame {
    const entities: Entity[] = [];
    const t = input.t;
    const part = input.part;

    // 1. Update chord history
    this.updateChordHistory(input, t);

    // 2. Render chord history as fading bands on the left
    for (let i = 0; i < this.state.chordHistory.length; i++) {
      const entry = this.state.chordHistory[i];
      const historyEntity = this.createChordHistoryBand(entry, i, t, part);
      entities.push(historyEntity);
    }

    // 3. Render active chords as central glows
    for (const annotatedChord of input.chords) {
      if (annotatedChord.chord.phase === "active") {
        const glowEntity = this.createChordGlow(annotatedChord, t, part);
        entities.push(glowEntity);
      } else if (annotatedChord.chord.phase === "decaying") {
        // Decaying chords get a dimmer glow
        const glowEntity = this.createChordGlow(annotatedChord, t, part, true);
        entities.push(glowEntity);
      }
    }

    // 4. Render notes that belong to chords as particles within the glow
    const notesInChords = new Set(
      input.chords.flatMap((ac) => ac.noteIds)
    );

    for (const annotatedNote of input.notes) {
      if (notesInChords.has(annotatedNote.note.id)) {
        const particleEntity = this.createNoteParticle(annotatedNote, t, part);
        entities.push(particleEntity);
      }
      // Notes not in chords are ignored by this grammar
    }

    // Note: We completely ignore input.beat and input.bars

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  /**
   * Update the chord history based on current frame.
   * Add new active chords, mark decaying ones, prune old entries.
   */
  private updateChordHistory(input: AnnotatedMusicalFrame, t: Ms): void {
    // Find currently active chords
    const activeChords = input.chords.filter((ac) => ac.chord.phase === "active");

    // Add new active chords to history if not already present
    for (const ac of activeChords) {
      const existingIndex = this.state.chordHistory.findIndex(
        (h: ChordHistoryEntry) => h.chordId === ac.chord.id
      );

      if (existingIndex === -1) {
        // New chord - add to history
        this.state.chordHistory.push({
          chordId: ac.chord.id,
          label: ac.visual.label,
          palette: ac.visual.palette,
          onset: ac.chord.onset,
          fadeStartTime: t + 500, // Start fading after 500ms
        });
      }
    }

    // Prune old history entries
    const cutoff = t - this.state.historyWindowMs;
    this.state.chordHistory = this.state.chordHistory.filter(
      (h: ChordHistoryEntry) => h.onset > cutoff
    );

    // Keep only maxHistory entries (most recent)
    if (this.state.chordHistory.length > this.state.maxHistory) {
      this.state.chordHistory = this.state.chordHistory.slice(
        -this.state.maxHistory
      );
    }
  }

  /**
   * Create a chord history band entity.
   * Bands are positioned on the left side, stacked vertically.
   */
  private createChordHistoryBand(
    entry: ChordHistoryEntry,
    index: number,
    t: Ms,
    part: string
  ): Entity {
    const totalSlots = this.state.maxHistory;
    const slotHeight = 0.8 / totalSlots; // Use 80% of screen height

    // Position: left side, stacked from bottom
    const x = 0.08; // 8% from left
    const y = 0.9 - (index + 0.5) * slotHeight; // Stack from bottom

    // Fade based on age
    const age = t - entry.onset;
    const fadeProgress = Math.min(age / this.state.historyWindowMs, 1);
    const opacity = 0.8 * (1 - fadeProgress * 0.7); // Fade to 30% opacity

    return {
      id: this.entityId(`history-${entry.chordId}`),
      part,
      kind: "field",
      createdAt: entry.onset,
      updatedAt: t,
      position: { x, y },
      style: {
        color: entry.palette.primary,
        size: 40,
        opacity,
      },
      data: {
        type: "chord-history",
        chordId: entry.chordId,
        label: entry.label,
        historyIndex: index,
      },
    };
  }

  /**
   * Create a chord glow entity.
   * Central radial glow that pulses with the chord.
   */
  private createChordGlow(
    ac: AnnotatedChord,
    t: Ms,
    part: string,
    isDecaying: boolean = false
  ): Entity {
    const visual = ac.visual;
    const chord = ac.chord;

    // Size based on number of notes and pulse
    const baseSize = 80 + chord.noteIds.length * 20;
    const pulseAmount = visual.motion.pulse * 20;
    const size = baseSize + pulseAmount * Math.sin(t / 200);

    // Opacity based on phase and flow
    let opacity = isDecaying ? 0.5 : 0.8;
    opacity += visual.motion.flow * 0.1;

    // Apply uncertainty as slight color variation
    const color = { ...visual.palette.primary };
    if (visual.uncertainty > 0.1) {
      color.s = Math.max(0, color.s - visual.uncertainty * 0.2);
    }

    return {
      id: this.entityId(`glow-${chord.id}`),
      part,
      kind: "field",
      createdAt: chord.onset,
      updatedAt: t,
      position: { x: 0.5, y: 0.5 }, // Center
      style: {
        color,
        size,
        opacity,
      },
      data: {
        type: "chord-glow",
        chordId: chord.id,
        label: visual.label,
        phase: chord.phase,
        noteCount: chord.noteIds.length,
      },
    };
  }

  /**
   * Create a note particle entity within a chord glow.
   * Small particles that orbit around the center.
   */
  private createNoteParticle(an: AnnotatedNote, t: Ms, part: string): Entity {
    const note = an.note;
    const visual = an.visual;

    // Position: orbit around center based on pitch class
    // Pitch class determines angle, octave determines radius
    const angle = (note.pitch.pc / 12) * Math.PI * 2;
    const radius = 0.1 + (note.pitch.octave - 3) * 0.03; // Octave affects distance from center

    // Add some motion based on time and jitter
    const jitter = visual.motion.jitter;
    const wobble = Math.sin(t / 100 + angle) * jitter * 0.02;

    const x = 0.5 + Math.cos(angle) * (radius + wobble);
    const y = 0.5 + Math.sin(angle) * (radius + wobble);

    // Size based on velocity
    const size = 6 + (note.velocity / 127) * 10;

    // Opacity based on phase
    let opacity: number;
    switch (note.phase) {
      case "attack":
        opacity = 1.0;
        break;
      case "sustain":
        opacity = 0.85;
        break;
      case "release":
        opacity = 0.4;
        break;
    }

    return {
      id: this.entityId(`particle-${note.id}`),
      part,
      kind: "particle",
      createdAt: note.onset,
      updatedAt: t,
      position: { x, y },
      style: {
        color: visual.palette.primary,
        size,
        opacity,
      },
      data: {
        type: "chord-note",
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
