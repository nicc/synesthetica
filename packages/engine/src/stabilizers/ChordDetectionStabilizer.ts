/**
 * Chord Detection Stabilizer
 *
 * Detects chords from active notes using a pitch-class decay approach.
 * Uses Tonal.js for chord identification.
 *
 * ## Pitch-Class Decay Model
 *
 * Instead of tracking note events and accumulation windows, we track when each
 * pitch class was last played. A pitch class stays "active" for `pitchDecayMs`
 * after being played. This naturally handles:
 *
 * - **Block chords**: All notes arrive together, all are in active set
 * - **Arpeggios**: Each note refreshes its pitch class timestamp
 * - **Brief gaps**: Pitch classes persist through short silences
 * - **Chord changes**: Old pitch classes decay, new ones take over
 *
 * ## Parameters
 *
 * - `pitchDecayMs`: How long a pitch class stays active (default 400ms)
 *   - 0 = only currently-sounding notes (block chords only)
 *   - 400ms = tolerates brief gaps (moderate arpeggios)
 *   - 800ms+ = very forgiving (slow arpeggios)
 *
 * - `minPitchClasses`: Minimum unique pitch classes to detect a chord (default 2)
 *
 * - `hysteresisMs`: How long new chord must be stable before switching (default 50ms)
 *   - Prevents flickering between ambiguous interpretations
 *
 * These can be combined into a "chord stability" macro at the grammar level.
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
   * How long a pitch class stays "active" after being played (ms).
   * - 0 = only currently-sounding notes (strict block chords)
   * - 400 = tolerates brief gaps (moderate arpeggios)
   * - 800+ = very forgiving (slow arpeggios)
   * @default 400
   */
  pitchDecayMs?: Ms;

  /**
   * Minimum unique pitch classes required to detect a chord.
   * @default 2
   */
  minPitchClasses?: number;

  /**
   * How long a new chord must be stable before switching display (ms).
   * Prevents flickering between ambiguous interpretations.
   * @default 50
   */
  hysteresisMs?: Ms;

  /**
   * How long to retain chord history for progression tracking.
   * @default 60000 (60 seconds)
   */
  progressionWindowMs?: Ms;
}

const DEFAULT_CONFIG: Required<Omit<ChordDetectionConfig, "partId">> = {
  pitchDecayMs: 400,
  minPitchClasses: 2,
  hysteresisMs: 50,
  progressionWindowMs: 60000,
};

/**
 * ChordDetectionStabilizer: Detects chords using pitch-class decay.
 *
 * Depends on an upstream stabilizer (e.g., NoteTrackingStabilizer) that
 * provides notes in the MusicalFrame.
 */
export class ChordDetectionStabilizer implements IMusicalStabilizer {
  readonly id = "chord-detection";
  readonly dependencies = ["note-tracking"];

  private config: Required<ChordDetectionConfig>;
  private provenance: Provenance;

  // When each pitch class was last played
  private pitchClassLastSeen: Map<PitchClass, Ms> = new Map();

  // Current displayed chord (after hysteresis)
  private displayedChord: { root: PitchClass; quality: ChordQuality } | null =
    null;

  // Candidate chord waiting for hysteresis
  private candidateChord: {
    root: PitchClass;
    quality: ChordQuality;
    since: Ms;
  } | null = null;

  // Recently completed chords (for progression)
  private recentChords: MusicalChord[] = [];

  // Track chord onset for duration calculation
  private currentChordOnset: Ms | null = null;

  constructor(config: ChordDetectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provenance = {
      source: "stabilizer",
      stream: this.id,
      version: "0.2.0",
    };
  }

  init(): void {
    this.pitchClassLastSeen.clear();
    this.displayedChord = null;
    this.candidateChord = null;
    this.recentChords = [];
    this.currentChordOnset = null;
  }

  dispose(): void {
    this.pitchClassLastSeen.clear();
    this.recentChords = [];
  }

  reset(): void {
    this.init();
  }

  apply(raw: RawInputFrame, upstream: MusicalFrame | null): MusicalFrame {
    if (!upstream) {
      return this.createEmptyFrame(raw.t);
    }

    const t = raw.t;

    // Update pitch class timestamps from active notes
    this.updatePitchClassTimestamps(upstream.notes, t);

    // Build active pitch class set (within decay window)
    const activePitchClasses = this.getActivePitchClasses(t);

    // Detect chord from active pitch classes
    const detected = this.detectChordFromPitchClasses(activePitchClasses);

    // Apply hysteresis
    this.applyHysteresis(detected, t);

    // Prune old chords from progression
    this.pruneOldChords(t);

    // Build current chords array
    const chords = this.buildCurrentChords(t, activePitchClasses);

    // Build progression (chord IDs only)
    const progression = this.recentChords.map((c) => c.id);

    return {
      ...upstream,
      t,
      chords,
      progression,
    };
  }

  /**
   * Update pitch class timestamps from notes.
   * Active notes refresh their pitch class timestamp.
   */
  private updatePitchClassTimestamps(notes: Note[], t: Ms): void {
    for (const note of notes) {
      // Only count notes that are currently sounding (not released)
      if (note.phase !== "release") {
        this.pitchClassLastSeen.set(note.pitch.pc, t);
      }
    }
  }

  /**
   * Get pitch classes that are within the decay window.
   */
  private getActivePitchClasses(t: Ms): Set<PitchClass> {
    const active = new Set<PitchClass>();

    for (const [pc, lastSeen] of this.pitchClassLastSeen) {
      if (t - lastSeen <= this.config.pitchDecayMs) {
        active.add(pc);
      }
    }

    return active;
  }

  /**
   * Detect chord from a set of pitch classes.
   */
  private detectChordFromPitchClasses(
    pitchClasses: Set<PitchClass>
  ): { root: PitchClass; quality: ChordQuality; confidence: Confidence } | null {
    if (pitchClasses.size < this.config.minPitchClasses) {
      return null;
    }

    // Convert pitch classes to note names (use octave 4 as reference)
    const noteNames = [...pitchClasses].map((pc) => this.pcToNoteName(pc));

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

  /**
   * Apply hysteresis to prevent flickering.
   * Only update displayed chord if new chord is stable for hysteresisMs.
   */
  private applyHysteresis(
    detected: { root: PitchClass; quality: ChordQuality } | null,
    t: Ms
  ): void {
    const isSameAsDisplayed =
      detected &&
      this.displayedChord &&
      detected.root === this.displayedChord.root &&
      detected.quality === this.displayedChord.quality;

    const isSameAsCandidate =
      detected &&
      this.candidateChord &&
      detected.root === this.candidateChord.root &&
      detected.quality === this.candidateChord.quality;

    if (isSameAsDisplayed) {
      // Current chord continues, clear any candidate
      this.candidateChord = null;
      return;
    }

    if (detected === null) {
      // No chord detected
      if (this.displayedChord && this.currentChordOnset !== null) {
        // Finalize the displayed chord
        this.finalizeChord(this.displayedChord, this.currentChordOnset, t);
      }
      this.displayedChord = null;
      this.candidateChord = null;
      this.currentChordOnset = null;
      return;
    }

    if (isSameAsCandidate) {
      // Candidate chord continues, check if hysteresis period has passed
      if (t - this.candidateChord!.since >= this.config.hysteresisMs) {
        // Finalize previous chord if any
        if (this.displayedChord && this.currentChordOnset !== null) {
          this.finalizeChord(this.displayedChord, this.currentChordOnset, t);
        }
        // Switch to candidate
        this.displayedChord = {
          root: this.candidateChord!.root,
          quality: this.candidateChord!.quality,
        };
        this.currentChordOnset = t;
        this.candidateChord = null;
      }
      return;
    }

    // New candidate chord
    this.candidateChord = {
      root: detected.root,
      quality: detected.quality,
      since: t,
    };
  }

  /**
   * Finalize a chord and add to progression.
   */
  private finalizeChord(
    chord: { root: PitchClass; quality: ChordQuality },
    onset: Ms,
    endTime: Ms
  ): void {
    const id = createChordId(
      this.config.partId,
      onset,
      chord.root,
      chord.quality
    );

    this.recentChords.push({
      id,
      root: chord.root,
      quality: chord.quality,
      bass: chord.root, // Simplified: assume root position
      inversion: 0,
      voicing: [], // Not tracked in this approach
      noteIds: [], // Not tracked in this approach
      onset,
      duration: endTime - onset,
      phase: "decaying",
      confidence: 0.8,
      provenance: this.provenance,
    });
  }

  /**
   * Build current chords array for output.
   */
  private buildCurrentChords(t: Ms, activePitchClasses: Set<PitchClass>): MusicalChord[] {
    const chords: MusicalChord[] = [];

    if (this.displayedChord && this.currentChordOnset !== null) {
      // Build voicing from active pitch classes
      const voicing: Pitch[] = [...activePitchClasses].map((pc) => ({
        pc,
        octave: 4, // Reference octave
      }));

      // Sort by pitch class distance from root for better voicing representation
      voicing.sort((a, b) => {
        const distA = (a.pc - this.displayedChord!.root + 12) % 12;
        const distB = (b.pc - this.displayedChord!.root + 12) % 12;
        return distA - distB;
      });

      const id = createChordId(
        this.config.partId,
        this.currentChordOnset,
        this.displayedChord.root,
        this.displayedChord.quality
      );

      chords.push({
        id,
        root: this.displayedChord.root,
        quality: this.displayedChord.quality,
        bass: this.displayedChord.root, // Simplified
        inversion: 0,
        voicing,
        noteIds: [], // Not tracked
        onset: this.currentChordOnset,
        duration: t - this.currentChordOnset,
        phase: "active",
        confidence: 0.8,
        provenance: this.provenance,
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
        onsetDrifts: [],
        stability: 0,
        confidence: 0,
      },
      dynamics: { level: 0, trend: "stable" },
      prescribedTempo: null,
      prescribedMeter: null,
      progression: this.recentChords.map((c) => c.id),
    };
  }

  // === Conversion helpers ===

  private pcToNoteName(pc: PitchClass): string {
    const names = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
    return names[pc];
  }

  private noteNameToPitchClass(noteName: string): PitchClass {
    const note = Tonal.Note.get(noteName);
    if (note.chroma === undefined) return 0;
    return note.chroma as PitchClass;
  }

  private mapTonalQuality(tonalQuality: string): ChordQuality {
    const mapping: Record<string, ChordQuality> = {
      Major: "maj",
      "": "maj",
      minor: "min",
      Minor: "min",
      m: "min",
      diminished: "dim",
      Diminished: "dim",
      dim: "dim",
      augmented: "aug",
      Augmented: "aug",
      aug: "aug",
      sus2: "sus2",
      sus4: "sus4",
      "Major seventh": "maj7",
      Maj7: "maj7",
      M7: "maj7",
      "minor seventh": "min7",
      "Minor seventh": "min7",
      m7: "min7",
      "dominant seventh": "dom7",
      "Dominant seventh": "dom7",
      "7": "dom7",
      "half-diminished": "hdim7",
      m7b5: "hdim7",
      "diminished seventh": "dim7",
      dim7: "dim7",
    };

    return mapping[tonalQuality] ?? "unknown";
  }
}
