import type {
  IPipeline,
  ISourceAdapter,
  IStabilizer,
  IRuleset,
  IGrammar,
  ICompositor,
  IActivityTracker,
  GrammarContext,
  CMSFrame,
  SceneFrame,
  PartId,
  SessionMs,
  Ms,
  Diagnostic,
  MusicalEvent,
} from "@synesthetica/contracts";

/**
 * Configuration for the pipeline.
 */
export interface PipelineConfig {
  /** Canvas dimensions for grammar context */
  canvasSize: { width: number; height: number };

  /** RNG seed for deterministic behavior (useful for testing/golden tests) */
  rngSeed?: number;
}

/**
 * Runtime state for a single part.
 */
interface PartState {
  grammarContexts: Map<string, GrammarContext>;
  previousScenes: Map<string, SceneFrame | null>;
}

/**
 * Pipeline orchestrator.
 *
 * Coordinates the flow: Adapters → Router → Stabilizers → Ruleset → Grammars → Compositor
 *
 * For Phase 0, we simplify:
 * - No router (single adapter, single part)
 * - Single stabilizer chain
 * - Single grammar per part
 *
 * See SPEC_008 for the full model.
 */
export class Pipeline implements IPipeline, IActivityTracker {
  private config: PipelineConfig;

  // Components
  private adapters: ISourceAdapter[] = [];
  private stabilizers: IStabilizer[] = [];
  private ruleset: IRuleset | null = null;
  private grammars: IGrammar[] = [];
  private compositor: ICompositor | null = null;

  // State
  private partStates: Map<PartId, PartState> = new Map();
  private activityLog: Array<{ part: PartId; t: SessionMs }> = [];
  private currentTime: SessionMs = 0;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  // === Configuration ===

  addAdapter(adapter: ISourceAdapter): void {
    this.adapters.push(adapter);
  }

  addStabilizer(stabilizer: IStabilizer): void {
    stabilizer.init();
    this.stabilizers.push(stabilizer);
  }

  setRuleset(ruleset: IRuleset): void {
    this.ruleset = ruleset;
  }

  addGrammar(grammar: IGrammar): void {
    this.grammars.push(grammar);
  }

  setCompositor(compositor: ICompositor): void {
    this.compositor = compositor;
  }

  // === IPipeline ===

  requestFrame(targetTime: SessionMs): SceneFrame {
    this.currentTime = targetTime;
    const diagnostics: Diagnostic[] = [];

    // 1. Collect frames from all adapters
    const collectedFrames: CMSFrame[] = [];
    for (const adapter of this.adapters) {
      const frame = adapter.nextFrame();
      if (frame) {
        collectedFrames.push(frame);
      }
    }

    // 2. Merge frames (simple concat for Phase 0)
    const mergedFrame = this.mergeFrames(collectedFrames, targetTime);

    // 3. Extract parts from events
    const partIds = this.extractPartIds(mergedFrame);

    // 4. Process each part
    const partScenes: SceneFrame[] = [];

    for (const partId of partIds) {
      // Filter frame to this part's events
      const partFrame = this.filterFrameForPart(mergedFrame, partId);

      // Record activity for each event in this part
      for (const event of partFrame.events) {
        const eventTime = this.getEventTime(event, targetTime);
        this.recordActivity(event.part, eventTime);
      }

      // Apply stabilizers
      let enrichedFrame = partFrame;
      for (const stabilizer of this.stabilizers) {
        enrichedFrame = stabilizer.apply(enrichedFrame);
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
        continue;
      }
      const intentFrame = this.ruleset.map(enrichedFrame);

      // Run grammars
      for (const grammar of this.grammars) {
        const partState = this.getOrCreatePartState(partId);

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
    }

    // 5. Composite
    if (!this.compositor) {
      // No compositor: merge scenes manually
      return this.mergeScenes(partScenes, targetTime, diagnostics);
    }

    const composited = this.compositor.compose(partScenes);
    // Add our diagnostics to the composited frame
    composited.diagnostics = [...composited.diagnostics, ...diagnostics];
    return composited;
  }

  // === IActivityTracker ===

  recordActivity(part: PartId, t: SessionMs): void {
    this.activityLog.push({ part, t });

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
      counts.set(entry.part, (counts.get(entry.part) ?? 0) + 1);
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
    for (const stabilizer of this.stabilizers) {
      stabilizer.reset();
    }
    this.partStates.clear();
    this.activityLog = [];
    this.currentTime = 0;
  }

  dispose(): void {
    for (const stabilizer of this.stabilizers) {
      stabilizer.dispose();
    }
    this.adapters = [];
    this.stabilizers = [];
    this.grammars = [];
    this.ruleset = null;
    this.compositor = null;
  }

  // === Helpers ===

  private mergeFrames(frames: CMSFrame[], t: SessionMs): CMSFrame {
    if (frames.length === 0) {
      return { t, events: [], controls: [] };
    }

    if (frames.length === 1) {
      return frames[0];
    }

    // Merge all events and controls
    const events = frames.flatMap((f) => f.events);
    const controls = frames.flatMap((f) => f.controls);
    const distributions = frames
      .flatMap((f) => f.distributions ?? [])
      .filter((d) => d !== undefined);

    return {
      t,
      events,
      controls,
      distributions: distributions.length > 0 ? distributions : undefined,
    };
  }

  private extractPartIds(frame: CMSFrame): PartId[] {
    const partIds = new Set<PartId>();

    // Include parts with events
    for (const event of frame.events) {
      partIds.add(event.part);
    }

    // Include parts with existing state (so particles continue to fade)
    for (const partId of this.partStates.keys()) {
      partIds.add(partId);
    }

    // If no parts at all, return a default part so grammars still run
    if (partIds.size === 0) {
      partIds.add("default");
    }

    return Array.from(partIds);
  }

  private filterFrameForPart(frame: CMSFrame, partId: PartId): CMSFrame {
    return {
      t: frame.t,
      events: frame.events.filter((e) => e.part === partId),
      controls: frame.controls, // Controls apply to all parts for now
      distributions: frame.distributions,
    };
  }

  private getEventTime(event: MusicalEvent, _fallback: SessionMs): SessionMs {
    // Chord events use span instead of t
    if (event.type === "chord") {
      return event.span.t0;
    }
    return event.t;
  }

  private getOrCreatePartState(partId: PartId): PartState {
    let state = this.partStates.get(partId);
    if (!state) {
      state = {
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
