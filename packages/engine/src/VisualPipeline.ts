/**
 * Visual Pipeline (RFC 005)
 *
 * Orchestrates the new frame type flow:
 * IRawSourceAdapter → IMusicalStabilizer → IVisualRuleset → IVisualGrammar → ICompositor
 *
 * This replaces the legacy Pipeline for new implementations.
 */

import type {
  IPipeline,
  IRawSourceAdapter,
  IMusicalStabilizer,
  IVisualRuleset,
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
  /** Stabilizer for this part */
  stabilizer: IMusicalStabilizer | null;

  /** Previous musical frame from stabilizer */
  previousMusicalFrame: MusicalFrame | null;

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
  private stabilizerFactory: (() => IMusicalStabilizer) | null = null;
  private ruleset: IVisualRuleset | null = null;
  private grammars: IVisualGrammar[] = [];
  private compositor: ICompositor | null = null;

  // State
  private partStates: Map<PartId, PartState> = new Map();
  private activityLog: Array<{ part: PartId; t: SessionMs; count: number }> = [];
  private currentTime: SessionMs = 0;

  constructor(config: VisualPipelineConfig) {
    this.config = config;
  }

  // === Configuration ===

  addAdapter(adapter: IRawSourceAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Set the stabilizer factory.
   * A factory is used because each part needs its own stabilizer instance.
   */
  setStabilizerFactory(factory: () => IMusicalStabilizer): void {
    this.stabilizerFactory = factory;
  }

  setRuleset(ruleset: IVisualRuleset): void {
    this.ruleset = ruleset;
  }

  addGrammar(grammar: IVisualGrammar): void {
    this.grammars.push(grammar);
  }

  setCompositor(compositor: ICompositor): void {
    this.compositor = compositor;
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

    // Apply stabilizer
    let musicalFrame: MusicalFrame;
    if (partState.stabilizer) {
      musicalFrame = partState.stabilizer.apply(
        mergedRaw,
        partState.previousMusicalFrame
      );
      partState.previousMusicalFrame = musicalFrame;
    } else {
      // No stabilizer - create empty musical frame
      musicalFrame = this.createEmptyMusicalFrame(targetTime, partId);
    }

    // Record activity based on note count
    if (musicalFrame.notes.length > 0) {
      this.recordActivity(partId, targetTime, musicalFrame.notes.length);
    }

    // Map to intents
    if (!this.ruleset) {
      diagnostics.push({
        id: `pipeline-no-ruleset-${targetTime}`,
        category: "control",
        severity: "warning",
        message: "No ruleset configured",
        timestamp: targetTime,
        source: "pipeline",
        persistence: "transient",
      });
      return this.mergeScenes([], targetTime, diagnostics);
    }

    const intentFrame = this.ruleset.map(musicalFrame);

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
      const scene = grammar.update(intentFrame, previous);
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
      if (state.stabilizer) {
        state.stabilizer.reset();
      }
    }
    this.partStates.clear();
    this.activityLog = [];
    this.currentTime = 0;
  }

  dispose(): void {
    for (const [, state] of this.partStates) {
      if (state.stabilizer) {
        state.stabilizer.dispose();
      }
    }
    this.adapters = [];
    this.stabilizerFactory = null;
    this.grammars = [];
    this.ruleset = null;
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
      beat: null,
      dynamics: {
        level: 0,
        trend: "stable",
      },
    };
  }

  private getOrCreatePartState(partId: PartId): PartState {
    let state = this.partStates.get(partId);
    if (!state) {
      // Create stabilizer for this part if factory available
      let stabilizer: IMusicalStabilizer | null = null;
      if (this.stabilizerFactory) {
        stabilizer = this.stabilizerFactory();
        stabilizer.init();
      }

      state = {
        stabilizer,
        previousMusicalFrame: null,
        grammarContexts: new Map(),
        previousScenes: new Map(),
      };
      this.partStates.set(partId, state);
    }
    return state;
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
