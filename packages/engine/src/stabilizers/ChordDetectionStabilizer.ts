/**
 * Chord Detection Stabilizer
 *
 * Detects chords from active notes in the upstream MusicalFrame.
 * Uses Tonal.js for chord identification.
 *
 * ## Design Decisions
 *
 * ### Onset Window
 * Notes are grouped into "simultaneous" sets using an onset window. A note joins
 * the current chord if it starts within `onsetWindowMs` of the most recent note
 * in that chord. This handles:
 * - Imperfect timing (notes meant to be simultaneous but slightly offset)
 * - Rolled/arpeggiated chords (notes played in sequence but forming one chord)
 *
 * The window is configurable. Default is 100ms.
 *
 * ### Chord Change Detection
 * A chord continues until:
 * - A new distinct chord is detected (different root or quality), OR
 * - Silence: all notes released for longer than `onsetWindowMs`
 *
 * This handles sustained chords that evolve (e.g., adding a 7th) vs. clear changes.
 *
 * ### Ambiguity
 * Tonal.js may return multiple chord possibilities. We pick the highest-ranked
 * match and set confidence based on how many alternatives exist:
 * - 1 match: confidence 1.0
 * - 2 matches: confidence 0.8
 * - 3+ matches: confidence 0.6
 *
 * ### Progression Window
 * Recent chord history is retained in `progression`. Default window is 60 seconds.
 * Gaps between chords are implicit (derived from onset/duration timestamps).
 *
 * ### Future Work
 * - Split chord accumulation at bar boundaries (see synesthetica-3th)
 * - Integrate with phrase detection for section-aware analysis
 *
 * @see IMusicalStabilizer for the stabilizer contract
 */

import * as Tonal from "tonal";
import type {
  IMusicalStabilizer,
  RawInputFrame,
  MusicalFrame,
  MusicalChord,
  Note,
  NoteId,
  Pitch,
  PitchClass,
  ChordQuality,
  Ms,
  Provenance,
  PartId,
  Confidence,
} from "@synesthetica/contracts";
import { createChordId } from "@synesthetica/contracts";

/**
 * Configuration for the ChordDetectionStabilizer.
 */
export interface ChordDetectionConfig {
  /**
   * Part ID this stabilizer is tracking.
   */
  partId: PartId;

  /**
   * Window in ms for grouping notes as "simultaneous".
   * Notes starting within this window of the most recent note join the chord.
   * @default 100
   */
  onsetWindowMs?: Ms;

  /**
   * How long to retain chord history for progression tracking.
   * @default 60000 (60 seconds)
   */
  progressionWindowMs?: Ms;
}

const DEFAULT_CONFIG: Required<Omit<ChordDetectionConfig, "partId">> = {
  onsetWindowMs: 100,
  progressionWindowMs: 60000,
};

/**
 * Internal state for tracking the current chord being formed.
 */
interface ChordInProgress {
  noteIds: NoteId[];
  pitches: Pitch[];
  onset: Ms;
  lastNoteOnset: Ms;
}

/**
 * ChordDetectionStabilizer: Detects chords from note data.
 *
 * Depends on an upstream stabilizer (e.g., NoteTrackingStabilizer) that
 * provides notes in the MusicalFrame.
 */
export class ChordDetectionStabilizer implements IMusicalStabilizer {
  readonly id = "chord-detection";
  readonly dependencies = ["note-tracking"];

  private config: Required<ChordDetectionConfig>;
  private provenance: Provenance;

  // Current chord being accumulated
  private chordInProgress: ChordInProgress | null = null;

  // Recently completed chords (for progression)
  private recentChords: MusicalChord[] = [];

  // Track the last detected chord to avoid duplicates
  private lastChord: { root: PitchClass; quality: ChordQuality } | null = null;

  // Track when silence started (all notes released)
  private silenceStartTime: Ms | null = null;

  constructor(config: ChordDetectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provenance = {
      source: "stabilizer",
      stream: this.id,
      version: "0.1.0",
    };
  }

  init(): void {
    this.chordInProgress = null;
    this.recentChords = [];
    this.lastChord = null;
    this.silenceStartTime = null;
  }

  dispose(): void {
    this.chordInProgress = null;
    this.recentChords = [];
  }

  reset(): void {
    this.init();
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    if (!upstream) {
      // No upstream data - return empty frame
      return this.createEmptyFrame(raw.t);
    }

    const t = raw.t;
    const activeNotes = upstream.notes.filter((n) => n.phase !== "release");

    // Prune old chords from progression
    this.pruneOldChords(t);

    // Handle silence detection
    if (activeNotes.length === 0) {
      if (this.silenceStartTime === null) {
        this.silenceStartTime = t;
      } else if (t - this.silenceStartTime > this.config.onsetWindowMs) {
        // Silence exceeded onset window - finalize any chord in progress
        this.finalizeChordInProgress(t);
        this.lastChord = null;
      }
    } else {
      this.silenceStartTime = null;
    }

    // Process active notes
    if (activeNotes.length > 0) {
      this.processNotes(activeNotes, t);
    }

    // Build current chords array
    const chords = this.buildCurrentChords(t);

    // Build progression (chord IDs only)
    const progression = this.recentChords.map((c) => c.id);

    return {
      ...upstream,
      t,
      chords,
      progression,
    };
  }

  private processNotes(notes: Note[], t: Ms): void {
    // Sort notes by onset time
    const sortedNotes = [...notes].sort((a, b) => a.onset - b.onset);

    for (const note of sortedNotes) {
      if (this.chordInProgress === null) {
        // Start a new chord
        this.chordInProgress = {
          noteIds: [note.id],
          pitches: [note.pitch],
          onset: note.onset,
          lastNoteOnset: note.onset,
        };
      } else {
        // Check if this note falls within the onset window
        const timeSinceLastNote = note.onset - this.chordInProgress.lastNoteOnset;

        if (timeSinceLastNote <= this.config.onsetWindowMs) {
          // Add to current chord if not already present
          if (!this.chordInProgress.noteIds.includes(note.id)) {
            this.chordInProgress.noteIds.push(note.id);
            this.chordInProgress.pitches.push(note.pitch);
            this.chordInProgress.lastNoteOnset = Math.max(
              this.chordInProgress.lastNoteOnset,
              note.onset
            );
          }
        } else {
          // Note is outside window - finalize current chord and start new one
          this.finalizeChordInProgress(t);
          this.chordInProgress = {
            noteIds: [note.id],
            pitches: [note.pitch],
            onset: note.onset,
            lastNoteOnset: note.onset,
          };
        }
      }
    }
  }

  private finalizeChordInProgress(t: Ms): void {
    if (!this.chordInProgress || this.chordInProgress.pitches.length < 2) {
      // Need at least 2 notes for a chord
      this.chordInProgress = null;
      return;
    }

    const detected = this.detectChord(this.chordInProgress.pitches);
    if (!detected) {
      this.chordInProgress = null;
      return;
    }

    // Check if this is a new chord or continuation
    const isNewChord =
      !this.lastChord ||
      this.lastChord.root !== detected.root ||
      this.lastChord.quality !== detected.quality;

    if (isNewChord) {
      const chord = this.createChord(
        detected,
        this.chordInProgress,
        t
      );
      this.recentChords.push(chord);
      this.lastChord = { root: detected.root, quality: detected.quality };
    }

    this.chordInProgress = null;
  }

  private detectChord(
    pitches: Pitch[]
  ): {
    root: PitchClass;
    quality: ChordQuality;
    confidence: Confidence;
  } | null {
    if (pitches.length < 2) return null;

    // Convert pitches to note names for Tonal
    const noteNames = pitches.map((p) => this.pitchToNoteName(p));

    // Use Tonal to detect chord
    const detected = Tonal.Chord.detect(noteNames);

    if (detected.length === 0) {
      return null;
    }

    // Parse the first (best) match
    const chordName = detected[0];
    const parsed = Tonal.Chord.get(chordName);

    if (!parsed.tonic) {
      return null;
    }

    const root = this.noteNameToPitchClass(parsed.tonic);
    const quality = this.mapTonalQuality(parsed.quality);

    // Confidence based on number of alternatives
    let confidence: Confidence;
    if (detected.length === 1) {
      confidence = 1.0;
    } else if (detected.length === 2) {
      confidence = 0.8;
    } else {
      confidence = 0.6;
    }

    return { root, quality, confidence };
  }

  private createChord(
    detected: { root: PitchClass; quality: ChordQuality; confidence: Confidence },
    inProgress: ChordInProgress,
    t: Ms
  ): MusicalChord {
    // Sort pitches low to high for voicing
    const sortedPitches = [...inProgress.pitches].sort((a, b) => {
      const midiA = a.octave * 12 + a.pc;
      const midiB = b.octave * 12 + b.pc;
      return midiA - midiB;
    });

    // Bass note is the lowest pitch
    const bass = sortedPitches[0].pc;

    // Calculate inversion
    const inversion = this.calculateInversion(detected.root, bass, sortedPitches);

    const id = createChordId(
      this.config.partId,
      inProgress.onset,
      detected.root,
      detected.quality
    );

    return {
      id,
      root: detected.root,
      quality: detected.quality,
      bass,
      inversion,
      voicing: sortedPitches,
      noteIds: inProgress.noteIds,
      onset: inProgress.onset,
      duration: t - inProgress.onset,
      phase: "active",
      confidence: detected.confidence,
      provenance: this.provenance,
    };
  }

  private calculateInversion(
    root: PitchClass,
    bass: PitchClass,
    voicing: Pitch[]
  ): number {
    if (bass === root) return 0;

    // Find which chord tone is in the bass
    // For simplicity, check common inversions:
    // 1st inversion = 3rd in bass
    // 2nd inversion = 5th in bass
    // This is approximate - a full implementation would need the chord's intervals

    const pitchClasses = voicing.map((p) => p.pc);
    const bassIndex = pitchClasses.indexOf(bass);

    if (bassIndex === -1) return 0;

    // Count how many chord tones are below the root in the voicing
    const rootIndex = pitchClasses.indexOf(root);
    if (rootIndex === -1) return 0;

    return bassIndex; // Simplified: bass position = inversion number
  }

  private buildCurrentChords(t: Ms): MusicalChord[] {
    const chords: MusicalChord[] = [];

    // Check if chord in progress is substantial enough to report
    if (this.chordInProgress && this.chordInProgress.pitches.length >= 2) {
      const detected = this.detectChord(this.chordInProgress.pitches);
      if (detected) {
        const sortedPitches = [...this.chordInProgress.pitches].sort((a, b) => {
          const midiA = a.octave * 12 + a.pc;
          const midiB = b.octave * 12 + b.pc;
          return midiA - midiB;
        });

        const bass = sortedPitches[0].pc;
        const inversion = this.calculateInversion(detected.root, bass, sortedPitches);

        const id = createChordId(
          this.config.partId,
          this.chordInProgress.onset,
          detected.root,
          detected.quality
        );

        chords.push({
          id,
          root: detected.root,
          quality: detected.quality,
          bass,
          inversion,
          voicing: sortedPitches,
          noteIds: this.chordInProgress.noteIds,
          onset: this.chordInProgress.onset,
          duration: t - this.chordInProgress.onset,
          phase: "active",
          confidence: detected.confidence,
          provenance: this.provenance,
        });
      }
    }

    // Include recent chords that are still "active" (within decay window)
    // For now, just include the most recent chord if it ended recently
    const lastChord = this.recentChords[this.recentChords.length - 1];
    if (lastChord && t - (lastChord.onset + lastChord.duration) < 500) {
      // Mark as decaying
      chords.push({
        ...lastChord,
        phase: "decaying",
        duration: t - lastChord.onset,
      });
    }

    return chords;
  }

  private pruneOldChords(t: Ms): void {
    const cutoff = t - this.config.progressionWindowMs;
    this.recentChords = this.recentChords.filter(
      (c) => c.onset + c.duration > cutoff
    );
  }

  private createEmptyFrame(t: Ms): MusicalFrame {
    return {
      t,
      part: this.config.partId,
      notes: [],
      chords: [],
      rhythmicAnalysis: {
        detectedDivision: null,
        recentOnsets: [],
        stability: 0,
        confidence: 0,
        referenceOnset: null,
      },
      dynamics: { level: 0, trend: "stable" },
      prescribedTempo: null,
      prescribedMeter: null,
      progression: this.recentChords.map((c) => c.id),
    };
  }

  // === Conversion helpers ===

  private pitchToNoteName(pitch: Pitch): string {
    const names = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    return names[pitch.pc] + pitch.octave;
  }

  private noteNameToPitchClass(noteName: string): PitchClass {
    const note = Tonal.Note.get(noteName);
    if (!note.chroma) return 0;
    return note.chroma as PitchClass;
  }

  private mapTonalQuality(tonalQuality: string): ChordQuality {
    // Map Tonal's quality strings to our ChordQuality type
    const mapping: Record<string, ChordQuality> = {
      "Major": "maj",
      "": "maj", // Empty string often means major
      "minor": "min",
      "Minor": "min",
      "m": "min",
      "diminished": "dim",
      "Diminished": "dim",
      "dim": "dim",
      "augmented": "aug",
      "Augmented": "aug",
      "aug": "aug",
      "sus2": "sus2",
      "sus4": "sus4",
      "Major seventh": "maj7",
      "Maj7": "maj7",
      "M7": "maj7",
      "minor seventh": "min7",
      "Minor seventh": "min7",
      "m7": "min7",
      "dominant seventh": "dom7",
      "Dominant seventh": "dom7",
      "7": "dom7",
      "half-diminished": "hdim7",
      "m7b5": "hdim7",
      "diminished seventh": "dim7",
      "dim7": "dim7",
    };

    return mapping[tonalQuality] ?? "unknown";
  }
}
