/**
 * Visual Pipeline (RFC 005 / RFC 006)
 *
 * Orchestrates the frame type flow:
 * IRawSourceAdapter → IMusicalStabilizer → IVisualVocabulary → IVisualGrammar → ICompositor
 *
 * RFC 006 changes:
 * - Vocabulary.annotate() returns AnnotatedMusicalFrame instead of VisualIntentFrame
 * - Grammars receive AnnotatedMusicalFrame, decide how/whether to render each element
 */

import type {
  IPipeline,
  IRawSourceAdapter,
  IMusicalStabilizer,
  IVisualVocabulary,
  IVisualGrammar,
  ICompositor,
  IActivityTracker,
  GrammarContext,
  RawInputFrame,
  MusicalFrame,
  SceneFrame,
  PartId,
  SessionMs,
  Ms,
  Diagnostic,
} from "@synesthetica/contracts";

/**
 * Configuration for the visual pipeline.
 */
export interface VisualPipelineConfig {
  /** Canvas dimensions for grammar context */
  canvasSize: { width: number; height: number };

  /** RNG seed for deterministic behavior (useful for testing/golden tests) */
  rngSeed?: number;

  /** Part ID for single-part mode (Phase 0 simplification) */
  partId?: PartId;
}

/**
 * Runtime state for a single part.
 */
interface PartState {
  /** Stabilizers for this part, in dependency order */
  stabilizers: IMusicalStabilizer[];

  /** Previous musical frames per stabilizer (keyed by stabilizer id) */
  previousMusicalFrames: Map<string, MusicalFrame | null>;

  /** Grammar contexts per grammar */
  grammarContexts: Map<string, GrammarContext>;

  /** Previous scene frames per grammar */
  previousScenes: Map<string, SceneFrame | null>;
}

/**
 * Visual Pipeline orchestrator.
 *
 * Implements the RFC 005 data flow:
 * Adapters → Router → Stabilizers → Ruleset → Grammars → Compositor
 *
 * For Phase 0, we simplify:
 * - No router (single adapter, single part)
 * - Single stabilizer per part
 * - All grammars receive same intent frame
 */
export class VisualPipeline implements IPipeline, IActivityTracker {
  private config: VisualPipelineConfig;

  // Components
  private adapters: IRawSourceAdapter[] = [];
  private stabilizerFactories: Array<() => IMusicalStabilizer> = [];
  private vocabulary: IVisualVocabulary | null = null;
  private grammars: IVisualGrammar[] = [];
  private compositor: ICompositor | null = null;

  // State
  private partStates: Map<PartId, PartState> = new Map();
  private activityLog: Array<{ part: PartId; t: SessionMs; count: number }> = [];
  private currentTime: SessionMs = 0;

  // Prescribed tempo/meter (user-set, not inferred)
  private prescribedTempo: number | null = null;
  private prescribedMeter: { beatsPerBar: number; beatUnit: number } | null = null;

  constructor(config: VisualPipelineConfig) {
    this.config = config;
  }

  // === Configuration ===

  addAdapter(adapter: IRawSourceAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Set the stabilizer factory (legacy single-stabilizer API).
   * @deprecated Use addStabilizerFactory for multiple stabilizers
   */
  setStabilizerFactory(factory: () => IMusicalStabilizer): void {
    this.stabilizerFactories = [factory];
  }

  /**
   * Add a stabilizer factory. Stabilizers are sorted by dependencies.
   * A factory is used because each part needs its own stabilizer instances.
   */
  addStabilizerFactory(factory: () => IMusicalStabilizer): void {
    this.stabilizerFactories.push(factory);
  }

  setVocabulary(vocabulary: IVisualVocabulary): void {
    this.vocabulary = vocabulary;
  }

  /**
   * @deprecated Use setVocabulary instead
   */
  setRuleset(vocabulary: IVisualVocabulary): void {
    this.setVocabulary(vocabulary);
  }

  addGrammar(grammar: IVisualGrammar): void {
    this.grammars.push(grammar);
  }

  setCompositor(compositor: ICompositor): void {
    this.compositor = compositor;
  }

  // === Tempo/Meter Control (RFC 007) ===

  /**
   * Set the prescribed tempo in BPM.
   * This enables beat-relative visualization in grammars.
   */
  setTempo(bpm: number | null): void {
    this.prescribedTempo = bpm;
  }

  /**
   * Set the prescribed time signature.
   * This enables bar-relative visualization in grammars.
   */
  setMeter(beatsPerBar: number | null, beatUnit: number = 4): void {
    if (beatsPerBar === null) {
      this.prescribedMeter = null;
    } else {
      this.prescribedMeter = { beatsPerBar, beatUnit };
    }
  }

  /**
   * Clear both tempo and meter.
   */
  clearTempoAndMeter(): void {
    this.prescribedTempo = null;
    this.prescribedMeter = null;
  }

  // === IPipeline ===

  requestFrame(targetTime: SessionMs): SceneFrame {
    this.currentTime = targetTime;
    const diagnostics: Diagnostic[] = [];

    // 1. Collect raw frames from all adapters
    const rawFrames: RawInputFrame[] = [];
    for (const adapter of this.adapters) {
      const frame = adapter.nextFrame();
      if (frame) {
        rawFrames.push(frame);
      }
    }

    // 2. Merge raw frames (simple concat for Phase 0)
    const mergedRaw = this.mergeRawFrames(rawFrames, targetTime);

    // 3. Determine parts to process
    // For Phase 0, use configured partId or "default"
    const partId = this.config.partId ?? "default";

    // 4. Process the part
    const partScenes: SceneFrame[] = [];

    // Get or create part state
    const partState = this.getOrCreatePartState(partId);

    // Apply stabilizers in dependency order
    let musicalFrame: MusicalFrame;
    if (partState.stabilizers.length > 0) {
      musicalFrame = this.applyStabilizers(partState, mergedRaw, targetTime, partId);
    } else {
      // No stabilizers - create empty musical frame
      musicalFrame = this.createEmptyMusicalFrame(targetTime, partId);
    }

    // Record activity based on note count
    if (musicalFrame.notes.length > 0) {
      this.recordActivity(partId, targetTime, musicalFrame.notes.length);
    }

    // Map to intents
    if (!this.vocabulary) {
      diagnostics.push({
        id: `pipeline-no-vocabulary-${targetTime}`,
        category: "control",
        severity: "warning",
        message: "No vocabulary configured",
        timestamp: targetTime,
        source: "pipeline",
        persistence: "transient",
      });
      return this.mergeScenes([], targetTime, diagnostics);
    }

    const annotatedFrame = this.vocabulary.annotate(musicalFrame);

    // Run grammars
    for (const grammar of this.grammars) {
      // Initialize grammar for this part if needed
      if (!partState.grammarContexts.has(grammar.id)) {
        const ctx: GrammarContext = {
          canvasSize: this.config.canvasSize,
          rngSeed: this.config.rngSeed ?? Date.now(),
          part: partId,
        };
        grammar.init(ctx);
        partState.grammarContexts.set(grammar.id, ctx);
        partState.previousScenes.set(grammar.id, null);
      }

      const previous = partState.previousScenes.get(grammar.id) ?? null;
      const scene = grammar.update(annotatedFrame, previous);
      partState.previousScenes.set(grammar.id, scene);
      partScenes.push(scene);
    }

    // 5. Composite
    if (!this.compositor) {
      return this.mergeScenes(partScenes, targetTime, diagnostics);
    }

    const composited = this.compositor.compose(partScenes);
    composited.diagnostics = [...composited.diagnostics, ...diagnostics];
    return composited;
  }

  // === IActivityTracker ===

  recordActivity(part: PartId, t: SessionMs, count = 1): void {
    this.activityLog.push({ part, t, count });

    // Keep only recent activity (last 10 seconds)
    const cutoff = t - 10000;
    this.activityLog = this.activityLog.filter((entry) => entry.t > cutoff);
  }

  getMostActive(windowMs: Ms): PartId | null {
    const cutoff = this.currentTime - windowMs;
    const recentActivity = this.activityLog.filter((entry) => entry.t > cutoff);

    if (recentActivity.length === 0) return null;

    // Count activity per part
    const counts = new Map<PartId, number>();
    for (const entry of recentActivity) {
      counts.set(entry.part, (counts.get(entry.part) ?? 0) + entry.count);
    }

    // Find most active
    let mostActive: PartId | null = null;
    let maxCount = 0;
    for (const [part, count] of counts) {
      if (count > maxCount) {
        mostActive = part;
        maxCount = count;
      }
    }

    return mostActive;
  }

  // === Lifecycle ===

  reset(): void {
    for (const [, state] of this.partStates) {
      for (const stabilizer of state.stabilizers) {
        stabilizer.reset();
      }
    }
    this.partStates.clear();
    this.activityLog = [];
    this.currentTime = 0;
  }

  dispose(): void {
    for (const [, state] of this.partStates) {
      for (const stabilizer of state.stabilizers) {
        stabilizer.dispose();
      }
    }
    this.adapters = [];
    this.stabilizerFactories = [];
    this.grammars = [];
    this.vocabulary = null;
    this.compositor = null;
  }

  // === Helpers ===

  private mergeRawFrames(frames: RawInputFrame[], t: SessionMs): RawInputFrame {
    if (frames.length === 0) {
      return {
        t,
        source: "merged",
        stream: "pipeline",
        inputs: [],
      };
    }

    if (frames.length === 1) {
      return frames[0];
    }

    // Merge all inputs
    const inputs = frames.flatMap((f) => f.inputs);

    return {
      t,
      source: "merged",
      stream: "pipeline",
      inputs,
    };
  }

  private createEmptyMusicalFrame(t: SessionMs, partId: PartId): MusicalFrame {
    return {
      t,
      part: partId,
      notes: [],
      chords: [],
      rhythmicAnalysis: {
        detectedDivision: null,
        onsetDrifts: [],
        stability: 0,
        confidence: 0,
      },
      dynamics: {
        level: 0,
        trend: "stable",
      },
      prescribedTempo: this.prescribedTempo,
      prescribedMeter: this.prescribedMeter,
    };
  }

  private getOrCreatePartState(partId: PartId): PartState {
    let state = this.partStates.get(partId);
    if (!state) {
      // Create stabilizers for this part
      const stabilizers: IMusicalStabilizer[] = [];
      for (const factory of this.stabilizerFactories) {
        const stabilizer = factory();
        stabilizer.init();
        stabilizers.push(stabilizer);
      }

      // Sort stabilizers by dependencies (topological sort)
      const sortedStabilizers = this.topologicalSortStabilizers(stabilizers);

      state = {
        stabilizers: sortedStabilizers,
        previousMusicalFrames: new Map(),
        grammarContexts: new Map(),
        previousScenes: new Map(),
      };
      this.partStates.set(partId, state);
    }
    return state;
  }

  /**
   * Apply stabilizers in dependency order, merging their outputs.
   */
  private applyStabilizers(
    partState: PartState,
    raw: RawInputFrame,
    t: SessionMs,
    partId: PartId
  ): MusicalFrame {
    // Start with empty frame
    let mergedFrame: MusicalFrame = this.createEmptyMusicalFrame(t, partId);

    // Build a map of stabilizer outputs for dependency resolution
    const outputs = new Map<string, MusicalFrame>();

    for (const stabilizer of partState.stabilizers) {
      // Determine upstream frame based on dependencies
      let upstream: MusicalFrame | null = null;

      if (stabilizer.dependencies && stabilizer.dependencies.length > 0) {
        // Merge outputs from all dependencies
        const depOutputs = stabilizer.dependencies
          .map((depId) => outputs.get(depId))
          .filter((f): f is MusicalFrame => f !== undefined);

        if (depOutputs.length > 0) {
          upstream = this.mergeMusicalFrames(depOutputs, t, partId);
        }
      }

      // Get previous frame for this stabilizer
      const previous = partState.previousMusicalFrames.get(stabilizer.id) ?? null;

      // Apply stabilizer
      const output = stabilizer.apply(raw, upstream ?? previous);

      // Store output for dependent stabilizers
      outputs.set(stabilizer.id, output);
      partState.previousMusicalFrames.set(stabilizer.id, output);

      // Merge into final frame
      mergedFrame = this.mergeMusicalFrames([mergedFrame, output], t, partId);
    }

    return mergedFrame;
  }

  /**
   * Topological sort of stabilizers based on dependencies.
   */
  private topologicalSortStabilizers(
    stabilizers: IMusicalStabilizer[]
  ): IMusicalStabilizer[] {
    const result: IMusicalStabilizer[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const stabilizerMap = new Map(stabilizers.map((s) => [s.id, s]));

    const visit = (stabilizer: IMusicalStabilizer) => {
      if (visited.has(stabilizer.id)) return;
      if (visiting.has(stabilizer.id)) {
        throw new Error(`Circular dependency detected: ${stabilizer.id}`);
      }

      visiting.add(stabilizer.id);

      // Visit dependencies first
      if (stabilizer.dependencies) {
        for (const depId of stabilizer.dependencies) {
          const dep = stabilizerMap.get(depId);
          if (dep) {
            visit(dep);
          }
          // If dependency not found, it might be external - ignore
        }
      }

      visiting.delete(stabilizer.id);
      visited.add(stabilizer.id);
      result.push(stabilizer);
    };

    for (const stabilizer of stabilizers) {
      visit(stabilizer);
    }

    return result;
  }

  /**
   * Merge multiple MusicalFrames into one.
   * Later frames override earlier ones for conflicting fields.
   */
  private mergeMusicalFrames(
    frames: MusicalFrame[],
    t: SessionMs,
    partId: PartId
  ): MusicalFrame {
    if (frames.length === 0) {
      return this.createEmptyMusicalFrame(t, partId);
    }

    if (frames.length === 1) {
      return frames[0];
    }

    // Merge notes (concat, dedupe by id)
    const notesMap = new Map<string, MusicalFrame["notes"][0]>();
    for (const frame of frames) {
      for (const note of frame.notes) {
        notesMap.set(note.id, note);
      }
    }

    // Merge chords (concat, dedupe by id)
    const chordsMap = new Map<string, MusicalFrame["chords"][0]>();
    for (const frame of frames) {
      for (const chord of frame.chords) {
        chordsMap.set(chord.id, chord);
      }
    }

    // Merge progression (concat, dedupe)
    const progressionSet = new Set<string>();
    for (const frame of frames) {
      if (frame.progression) {
        for (const chordId of frame.progression) {
          progressionSet.add(chordId);
        }
      }
    }

    // Take latest non-null values for rhythmicAnalysis and dynamics
    let rhythmicAnalysis: MusicalFrame["rhythmicAnalysis"] = {
      detectedDivision: null,
      onsetDrifts: [],
      stability: 0,
      confidence: 0,
    };
    let dynamics: MusicalFrame["dynamics"] = { level: 0, trend: "stable" };

    for (const frame of frames) {
      if (frame.rhythmicAnalysis.detectedDivision !== null) {
        rhythmicAnalysis = frame.rhythmicAnalysis;
      }
      if (frame.dynamics.level > 0) dynamics = frame.dynamics;
    }

    // prescribedTempo and prescribedMeter come from pipeline (user setting), not from stabilizers
    return {
      t,
      part: partId,
      notes: Array.from(notesMap.values()),
      chords: Array.from(chordsMap.values()),
      rhythmicAnalysis,
      dynamics,
      prescribedTempo: this.prescribedTempo,
      prescribedMeter: this.prescribedMeter,
      progression: progressionSet.size > 0 ? Array.from(progressionSet) : undefined,
    };
  }

  private mergeScenes(
    scenes: SceneFrame[],
    t: SessionMs,
    additionalDiagnostics: Diagnostic[]
  ): SceneFrame {
    if (scenes.length === 0) {
      return { t, entities: [], diagnostics: additionalDiagnostics };
    }

    const entities = scenes.flatMap((s) => s.entities);
    const diagnostics = [
      ...scenes.flatMap((s) => s.diagnostics),
      ...additionalDiagnostics,
    ];

    return { t, entities, diagnostics };
  }
}
