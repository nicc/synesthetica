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
  ChordInterpretation,
  Note,
  Pitch,
  PitchClass,
  ChordQuality,
  Ms,
  Provenance,
  PartId,
  Confidence,
  PrescribedKey,
} from "@synesthetica/contracts";
import { createChordId, createEmptyMusicalFrame } from "@synesthetica/contracts";
import {
  buildSpellingTable,
  buildDiatonicPitchClasses,
  pitchClassToNoteName,
} from "../utils/pitchSpelling";

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
 * Tonal chord `type` values we consider "standard" — the named chord
 * categories common in lead sheets and harmonic analysis. Anything
 * else (including empty-string type, which Tonal returns for complex
 * or unlabelled combinations) is treated as altered/decorated.
 *
 * Used to bias scoring toward musically-canonical interpretations over
 * decorated ones when multiple candidates fit a voicing equally well.
 */
const STANDARD_CHORD_TYPES = new Set<string>([
  // Triads
  "major",
  "minor",
  "diminished",
  "augmented",
  "suspended second",
  "suspended fourth",
  // Sixth chords
  "sixth",
  "minor sixth",
  // Sevenths
  "major seventh",
  "minor seventh",
  "dominant seventh",
  "half-diminished",
  "diminished seventh",
  "minor major seventh",
  // Ninths
  "major ninth",
  "minor ninth",
  "dominant ninth",
  // Elevenths
  "major eleventh",
  "minor eleventh",
  "dominant eleventh",
  // Thirteenths
  "major thirteenth",
  "minor thirteenth",
  "dominant thirteenth",
  // Altered dominants (standard in jazz)
  "dominant flat ninth",
  "dominant sharp ninth",
]);

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
  private displayedChord: {
    harmonic: ChordInterpretation;
    bassLed: ChordInterpretation;
  } | null = null;

  // Candidate chord waiting for hysteresis
  private candidateChord: {
    harmonic: ChordInterpretation;
    bassLed: ChordInterpretation;
    since: Ms;
  } | null = null;

  // Recently completed chords (for progression)
  private recentChords: MusicalChord[] = [];

  // Track chord onset for duration calculation
  private currentChordOnset: Ms | null = null;

  // Cached pitch-class → note-name spelling table for the prescribed key.
  // Rebuilt when the key changes; null when no key is set (falls back to
  // default flat-preferring spelling).
  private spellingTable: Record<PitchClass, string> | null = null;
  // Set of diatonic pitch classes for the current key, used by the
  // key-aware scoring bias. null when no key is set.
  private diatonicPcs: Set<PitchClass> | null = null;
  private lastKeyKey: string | null = null;

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

    // Refresh the spelling table if the prescribed key changed
    this.refreshSpellingTable(upstream.prescribedKey);

    // Update pitch class timestamps from active notes
    this.updatePitchClassTimestamps(upstream.notes, t);

    // Build active pitch class set (within decay window)
    const activePitchClasses = this.getActivePitchClasses(t);

    // Find the actual bass pitch class (lowest currently-sounding note).
    // Used to disambiguate Tonal's input-order-sensitive detection: passing
    // the bass first ensures root-position candidates surface for chords
    // whose bass matches the root, and slash chords surface when the bass
    // genuinely differs from the harmonic root.
    const bassPc = this.getBassPc(upstream.notes);

    // Detect chord from active pitch classes
    const detected = this.detectChordFromPitchClasses(activePitchClasses, bassPc);

    // Apply hysteresis
    this.applyHysteresis(detected, t);

    // Prune old chords from progression
    this.pruneOldChords(t);

    // Build current chords array
    const chords = this.buildCurrentChords(t, activePitchClasses, bassPc);

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
  /**
   * Return the pitch class of the lowest currently-sounding note, or null
   * when no notes are active. Uses pitch + octave to find the MIDI-lowest
   * note, then returns just its pc (since chord detection is pc-based).
   */
  private getBassPc(notes: Note[]): PitchClass | null {
    let lowestMidi = Infinity;
    let bassPc: PitchClass | null = null;
    for (const note of notes) {
      if (note.phase === "release") continue;
      const midi = note.pitch.pc + note.pitch.octave * 12;
      if (midi < lowestMidi) {
        lowestMidi = midi;
        bassPc = note.pitch.pc;
      }
    }
    return bassPc;
  }

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
   *
   * Tries the full note set AND all (n-1) subsets (dropping one note at a
   * time). Each candidate is scored by how many input pitch classes match
   * the MAPPED quality's expected intervals. This prefers simpler, more
   * recognizable chords: Cmaj7 (4/5 match) beats EmMaj7b6 (3/5 after
   * mapping to "min").
   */
  private detectChordFromPitchClasses(
    pitchClasses: Set<PitchClass>,
    bassPc?: PitchClass | null,
  ): {
    harmonic: ChordInterpretation;
    bassLed: ChordInterpretation;
  } | null {
    if (pitchClasses.size < this.config.minPitchClasses) {
      return null;
    }

    // Put the bass pc first if available — Tonal's Chord.detect uses the
    // first note as a bass hint when generating candidates. Without this,
    // iteration order of the pitch-class Set (history-dependent) would
    // determine whether root-position or slash-chord candidates surface
    // for a given voicing.
    const pcArray = [...pitchClasses];
    if (
      bassPc !== undefined &&
      bassPc !== null &&
      pitchClasses.has(bassPc)
    ) {
      const idx = pcArray.indexOf(bassPc);
      if (idx > 0) {
        pcArray.splice(idx, 1);
        pcArray.unshift(bassPc);
      }
    }
    const noteNames = pcArray.map((pc) => this.pcToNoteName(pc));

    // Collect candidate detections from full set and (n-1) subsets.
    // We score against the chord's actual intervals from Tonal (which
    // include extensions like 9, 11, 13), not the simplified quality's
    // triad/7th template. This lets extended chords beat partial-voicing
    // triads on coverage instead of being silently skipped as "unknown".
    type Candidate = {
      root: PitchClass;
      quality: ChordQuality;
      chordTones: number[];
      name: string;
      coverage: number;
      complexity: number;
      keyFit: number;
      isSlash: boolean;
      /** False when Tonal's type is a well-known standard chord label
       * (major, minor, dom7, etc.). True for altered / decorated types
       * like "minor augmented" or unlabelled complex types. */
      isAltered: boolean;
    };
    const candidates: Candidate[] = [];
    const diatonicPcs = this.diatonicPcs;

    const tryDetect = (names: string[]): void => {
      const detected = Tonal.Chord.detect(names);
      for (const name of detected) {
        const chord = Tonal.Chord.get(name);
        if (!chord.tonic || !chord.intervals || chord.intervals.length === 0) {
          continue;
        }
        // Slash chords (e.g. "Ab/C", "Gb69#11/Ab") name a chord with a
        // specific bass. In ambiguous voicings these compete with
        // root-position interpretations that usually read more naturally.
        const isSlash = name.includes("/");

        // Parse Tonal's interval names ("1P", "3M", "5P", "7m", "9M", …)
        // into pitch-class semitones.
        const chordTones = chord.intervals
          .map((ivl) => Tonal.Interval.semitones(ivl))
          .filter((s): s is number => s !== undefined)
          .map((s) => ((s % 12) + 12) % 12);

        if (chordTones.length === 0) continue;

        const root = this.noteNameToPitchClass(chord.tonic);
        const quality = this.mapTonalQuality(chord.quality, chord.type);

        // Coverage: how many input PCs are accounted for by the chord's
        // actual interval set.
        let coverage = 0;
        for (const pc of pitchClasses) {
          const semitones = (pc - root + 12) % 12;
          if (chordTones.includes(semitones)) coverage++;
        }

        // Key fit (0–1): half weight on root-diatonic, half on fraction
        // of chord tones that are diatonic. Zero when no key is set.
        let keyFit = 0;
        if (diatonicPcs) {
          const rootDiatonic = diatonicPcs.has(root) ? 0.5 : 0;
          let toneMatches = 0;
          for (const t of chordTones) {
            const pc = ((root + t) % 12) as PitchClass;
            if (diatonicPcs.has(pc)) toneMatches++;
          }
          const tonesDiatonic = 0.5 * (toneMatches / chordTones.length);
          keyFit = rootDiatonic + tonesDiatonic;
        }

        const isAltered = !STANDARD_CHORD_TYPES.has(chord.type ?? "");

        candidates.push({
          root,
          quality,
          chordTones,
          name,
          coverage,
          complexity: chordTones.length,
          keyFit,
          isSlash,
          isAltered,
        });
      }
    };

    // Always collect full-set and (n-1) subset candidates. Subsets can
    // surface root-position chords (e.g. "Ab11") that Tonal's full-set
    // detection names only as slash chords. Coverage is still scored
    // against the original input so lower-coverage subsets can't win.
    tryDetect(noteNames);
    if (noteNames.length > this.config.minPitchClasses) {
      for (let i = 0; i < noteNames.length; i++) {
        const subset = noteNames.filter((_, j) => j !== i);
        tryDetect(subset);
      }
    }

    if (candidates.length === 0) return null;

    // Tiebreaker chain (harmonic-interpretation default):
    //   1. Effective coverage desc — coverage minus a 1-note penalty only
    //      for chords that are BOTH altered AND slash. This lets
    //      root-position standard chords (Ab11, AbM) win over altered
    //      slash ones (Gb69#11/Ab, Cm#5/Ab) when their raw coverage is
    //      close. Standard slash chords (EbM/G, CM/E) are NOT demoted —
    //      they represent legitimate inversions of simple chords.
    //   2. Canonicity desc — standard chord types beat altered ones.
    //      Catches cases where non-slash altered chords (e.g. Gm#5)
    //      would otherwise win over standard slash alternatives
    //      (e.g. EbM/G) on the non-slash tiebreaker.
    //   3. Non-slash preferred — when both standard or both altered,
    //      prefer the root-position reading.
    //   4. Key fit desc — when a key is set, diatonic tones win.
    //   5. Complexity asc — simpler interpretations when still tied.
    const effectiveCoverage = (c: Candidate): number =>
      c.coverage - (c.isSlash && c.isAltered ? 1 : 0);
    candidates.sort((a, b) => {
      const ea = effectiveCoverage(a);
      const eb = effectiveCoverage(b);
      if (eb !== ea) return eb - ea;
      if (a.isAltered !== b.isAltered) return a.isAltered ? 1 : -1;
      if (a.isSlash !== b.isSlash) return a.isSlash ? 1 : -1;
      if (diatonicPcs && b.keyFit !== a.keyFit) return b.keyFit - a.keyFit;
      return a.complexity - b.complexity;
    });
    const best = candidates[0];
    const toInterpretation = (c: Candidate): ChordInterpretation => ({
      root: c.root,
      quality: c.quality,
      chordTones: c.chordTones,
      name: c.name,
      confidence: Math.min(1, c.coverage / pitchClasses.size) as Confidence,
    });

    const harmonic = toInterpretation(best);

    // Bass-led: pick the best candidate among those rooted at the bass.
    // If no candidate matches, fall back to harmonic (the two
    // interpretations converge in this case — no bass-led reading exists).
    let bassLed: ChordInterpretation = harmonic;
    if (bassPc !== undefined && bassPc !== null) {
      const bassLedCandidate = candidates.find((c) => c.root === bassPc);
      if (bassLedCandidate) {
        bassLed = toInterpretation(bassLedCandidate);
      }
    }

    return { harmonic, bassLed };
  }

  /**
   * Apply hysteresis to prevent flickering.
   * Only update displayed chord if new chord is stable for hysteresisMs.
   */
  private applyHysteresis(
    detected: {
      harmonic: ChordInterpretation;
      bassLed: ChordInterpretation;
    } | null,
    t: Ms
  ): void {
    // Identity for hysteresis is based on the harmonic interpretation —
    // changes in bass-led alone (e.g. same chord with different bass)
    // shouldn't trigger a chord transition.
    const isSameAsDisplayed =
      detected &&
      this.displayedChord &&
      detected.harmonic.root === this.displayedChord.harmonic.root &&
      detected.harmonic.quality === this.displayedChord.harmonic.quality;

    const isSameAsCandidate =
      detected &&
      this.candidateChord &&
      detected.harmonic.root === this.candidateChord.harmonic.root &&
      detected.harmonic.quality === this.candidateChord.harmonic.quality;

    if (isSameAsDisplayed) {
      // Current chord continues — keep updating the bass-led reading in
      // case the bass note changed while the harmonic chord held steady.
      this.displayedChord = detected!;
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
          harmonic: this.candidateChord!.harmonic,
          bassLed: this.candidateChord!.bassLed,
        };
        this.currentChordOnset = t;
        this.candidateChord = null;
      }
      return;
    }

    // New candidate chord
    this.candidateChord = {
      harmonic: detected.harmonic,
      bassLed: detected.bassLed,
      since: t,
    };
  }

  /**
   * Build a MusicalChord output from harmonic + bass-led interpretations
   * and the voicing context. Inversion is derived from the harmonic
   * reading (the "which chord tone is in the bass" question only makes
   * sense against the harmonic root).
   */
  private buildChordOutput(params: {
    harmonic: ChordInterpretation;
    bassLed: ChordInterpretation;
    voicing: Pitch[];
    bassPc: PitchClass | null;
    onset: Ms;
    endTime: Ms;
    phase: "active" | "decaying";
  }): MusicalChord {
    const { harmonic, bassLed, voicing, bassPc, onset, endTime, phase } = params;

    const id = createChordId(
      this.config.partId,
      onset,
      harmonic.root,
      harmonic.quality
    );

    const actualBass = bassPc ?? harmonic.root;
    const rootSemitone = (actualBass - harmonic.root + 12) % 12;
    const inversionIdx = harmonic.chordTones.indexOf(rootSemitone);
    const inversion = inversionIdx >= 0 ? inversionIdx : 0;

    return {
      id,
      voicing,
      noteIds: [],
      bass: actualBass,
      inversion,
      isInverted: actualBass !== harmonic.root,
      harmonic,
      bassLed,
      onset,
      duration: endTime - onset,
      phase,
      provenance: this.provenance,
    };
  }

  /**
   * Finalize a chord and add to progression.
   */
  private finalizeChord(
    chord: {
      harmonic: ChordInterpretation;
      bassLed: ChordInterpretation;
    },
    onset: Ms,
    endTime: Ms
  ): void {
    this.recentChords.push(
      this.buildChordOutput({
        harmonic: chord.harmonic,
        bassLed: chord.bassLed,
        voicing: [],
        bassPc: null,
        onset,
        endTime,
        phase: "decaying",
      }),
    );
  }

  /**
   * Build current chords array for output.
   */
  private buildCurrentChords(
    t: Ms,
    activePitchClasses: Set<PitchClass>,
    bassPc: PitchClass | null,
  ): MusicalChord[] {
    const chords: MusicalChord[] = [];

    if (this.displayedChord && this.currentChordOnset !== null) {
      // Build voicing from active pitch classes
      const voicing: Pitch[] = [...activePitchClasses].map((pc) => ({
        pc,
        octave: 4, // Reference octave
      }));

      // Sort by pitch class distance from harmonic root for better voicing representation
      const harmonicRoot = this.displayedChord.harmonic.root;
      voicing.sort((a, b) => {
        const distA = (a.pc - harmonicRoot + 12) % 12;
        const distB = (b.pc - harmonicRoot + 12) % 12;
        return distA - distB;
      });

      chords.push(
        this.buildChordOutput({
          harmonic: this.displayedChord.harmonic,
          bassLed: this.displayedChord.bassLed,
          voicing,
          bassPc,
          onset: this.currentChordOnset,
          endTime: t,
          phase: "active",
        }),
      );
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
      ...createEmptyMusicalFrame(t, this.config.partId),
      progression: this.recentChords.map((c) => c.id),
    };
  }

  // === Conversion helpers ===

  private pcToNoteName(pc: PitchClass): string {
    return pitchClassToNoteName(pc, this.spellingTable ?? undefined);
  }

  /**
   * Rebuild the spelling table when the prescribed key changes. Cheap to
   * check, expensive to rebuild — skip the work when the key is stable.
   */
  private refreshSpellingTable(key: PrescribedKey | null): void {
    const keySig = key ? `${key.root}:${key.mode}` : "";
    if (keySig === this.lastKeyKey) return;
    this.lastKeyKey = keySig;
    this.spellingTable = key ? buildSpellingTable(key) : null;
    this.diatonicPcs = key ? buildDiatonicPitchClasses(key) : null;
  }

  private noteNameToPitchClass(noteName: string): PitchClass {
    const note = Tonal.Note.get(noteName);
    if (note.chroma === undefined) return 0;
    return note.chroma as PitchClass;
  }

  private mapTonalQuality(tonalQuality: string, tonalType?: string): ChordQuality {
    // Tonal.js's `type` field is more specific than `quality`. For example,
    // quality="Major" for both major triads and dominant 7ths, while type
    // distinguishes "major" from "dominant seventh". Check type first.
    if (tonalType) {
      const typeMapping: Record<string, ChordQuality> = {
        major: "maj",
        minor: "min",
        diminished: "dim",
        augmented: "aug",
        "suspended second": "sus2",
        "suspended fourth": "sus4",
        "major seventh": "maj7",
        "minor seventh": "min7",
        "dominant seventh": "dom7",
        "half-diminished": "hdim7",
        "diminished seventh": "dim7",
      };
      const fromType = typeMapping[tonalType];
      if (fromType) return fromType;
    }

    // Fall back to quality field for any types not in the mapping above
    const qualityMapping: Record<string, ChordQuality> = {
      Major: "maj",
      "": "maj",
      minor: "min",
      Minor: "min",
      diminished: "dim",
      Diminished: "dim",
      augmented: "aug",
      Augmented: "aug",
    };

    return qualityMapping[tonalQuality] ?? "unknown";
  }
}
