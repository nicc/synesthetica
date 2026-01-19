/**
 * Visual Particle Grammar
 *
 * Maps visual intents to particle entities. Uses intent presence/absence
 * to manage entity lifecycle - entities appear when intents arrive and
 * fade when intents disappear.
 *
 * This implements IVisualGrammar (RFC 005) and does NOT access musical events.
 */

import type {
  IVisualGrammar,
  GrammarContext,
  VisualIntentFrame,
  SceneFrame,
  Entity,
  EntityId,
  Vec2,
  PaletteIntent,
  MotionIntent,
  VisualIntentId,
} from "@synesthetica/contracts";

/**
 * Configuration for the VisualParticleGrammar.
 */
export interface VisualParticleGrammarConfig {
  /**
   * How long entities linger after their intent disappears (ms).
   * @default 500
   */
  fadeOutMs?: number;

  /**
   * Base size for particles.
   * @default 20
   */
  baseSize?: number;
}

const DEFAULT_CONFIG: Required<VisualParticleGrammarConfig> = {
  fadeOutMs: 500,
  baseSize: 20,
};

/**
 * Tracks an entity that was created from an intent.
 */
interface TrackedEntity {
  entity: Entity;
  intentId: VisualIntentId;
  fadeStartTime: number | null;
}

/**
 * VisualParticleGrammar: Creates particle entities from visual intents.
 *
 * Key behavior:
 * - When a palette intent appears, create a particle entity
 * - Position is derived from palette hue (x) and brightness (y)
 * - When an intent disappears, the entity starts fading
 * - Entities are removed after fadeOutMs
 *
 * This grammar uses intent IDs to correlate intents across frames,
 * enabling smooth lifecycle management without seeing musical events.
 */
export class VisualParticleGrammar implements IVisualGrammar {
  readonly id = "visual-particle";
  readonly paramsSchema = {
    fadeOutMs: { type: "number", default: 500 },
    baseSize: { type: "number", default: 20 },
  };

  private config: Required<VisualParticleGrammarConfig>;
  private ctx: GrammarContext | null = null;
  private trackedEntities: Map<VisualIntentId, TrackedEntity> = new Map();
  private nextEntityId = 0;

  constructor(config: VisualParticleGrammarConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  init(ctx: GrammarContext): void {
    this.ctx = ctx;
    this.trackedEntities.clear();
    this.nextEntityId = 0;
  }

  update(input: VisualIntentFrame, previous: SceneFrame | null): SceneFrame {
    if (!this.ctx) {
      throw new Error("VisualParticleGrammar not initialized");
    }

    const t = input.t;
    const entities: Entity[] = [];

    // Build set of current intent IDs
    const currentIntentIds = new Set<VisualIntentId>();
    const paletteIntents = input.intents.filter(
      (i): i is PaletteIntent => i.type === "palette" && i.id !== undefined
    );

    for (const intent of paletteIntents) {
      currentIntentIds.add(intent.id!);
    }

    // Update existing tracked entities
    for (const [intentId, tracked] of this.trackedEntities) {
      const intentStillPresent = currentIntentIds.has(intentId);

      if (intentStillPresent) {
        // Intent still present - update entity from current intent
        const intent = paletteIntents.find((i) => i.id === intentId)!;
        const updatedEntity = this.updateEntityFromIntent(
          tracked.entity,
          intent,
          t
        );
        entities.push(updatedEntity);
        tracked.entity = updatedEntity;
        tracked.fadeStartTime = null;
      } else {
        // Intent disappeared - start fading or continue fade
        if (tracked.fadeStartTime === null) {
          tracked.fadeStartTime = t;
        }

        const fadeProgress = (t - tracked.fadeStartTime) / this.config.fadeOutMs;

        if (fadeProgress < 1) {
          // Still fading - update opacity
          const fadedEntity: Entity = {
            ...tracked.entity,
            updatedAt: t,
            style: {
              ...tracked.entity.style,
              opacity: Math.max(0, 1 - fadeProgress),
            },
          };
          entities.push(fadedEntity);
          tracked.entity = fadedEntity;
        }
        // else: fade complete, don't add to entities (will be pruned)
      }
    }

    // Prune fully faded entities
    for (const [intentId, tracked] of this.trackedEntities) {
      if (tracked.fadeStartTime !== null) {
        const fadeProgress =
          (t - tracked.fadeStartTime) / this.config.fadeOutMs;
        if (fadeProgress >= 1) {
          this.trackedEntities.delete(intentId);
        }
      }
    }

    // Create new entities for new intents
    for (const intent of paletteIntents) {
      if (!this.trackedEntities.has(intent.id!)) {
        const entity = this.createEntityFromIntent(intent, t);
        entities.push(entity);
        this.trackedEntities.set(intent.id!, {
          entity,
          intentId: intent.id!,
          fadeStartTime: null,
        });
      }
    }

    // Apply motion intents to entities
    const motionIntent = input.intents.find(
      (i): i is MotionIntent => i.type === "motion"
    );
    if (motionIntent) {
      this.applyMotionToEntities(entities, motionIntent, t, previous?.t ?? t);
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  private createEntityFromIntent(intent: PaletteIntent, t: number): Entity {
    const position = this.intentToPosition(intent);
    const size = this.config.baseSize * (0.5 + intent.base.v * 0.5);

    return {
      id: this.generateId(),
      part: this.ctx!.part,
      kind: "particle",
      createdAt: t,
      updatedAt: t,
      position,
      velocity: { x: 0, y: 0 },
      style: {
        color: intent.base,
        size,
        opacity: intent.base.a,
      },
      data: {
        intentId: intent.id,
        stability: intent.stability,
      },
    };
  }

  private updateEntityFromIntent(
    entity: Entity,
    intent: PaletteIntent,
    t: number
  ): Entity {
    const position = this.intentToPosition(intent);
    const size = this.config.baseSize * (0.5 + intent.base.v * 0.5);

    return {
      ...entity,
      updatedAt: t,
      position,
      style: {
        color: intent.base,
        size,
        opacity: intent.base.a,
      },
      data: {
        ...entity.data,
        stability: intent.stability,
      },
    };
  }

  private intentToPosition(intent: PaletteIntent): Vec2 {
    if (!this.ctx) {
      return { x: 0, y: 0 };
    }

    const { width, height } = this.ctx.canvasSize;

    // Map hue (0-360) to x position
    const x = (intent.base.h / 360) * (width * 0.8) + width * 0.1;

    // Map brightness (0-1) to y position (brighter = higher)
    const y = height - (intent.base.v * (height * 0.8) + height * 0.1);

    return { x, y };
  }

  private applyMotionToEntities(
    entities: Entity[],
    motion: MotionIntent,
    t: number,
    previousT: number
  ): void {
    const dt = (t - previousT) / 1000; // seconds
    const pulseVelocity = motion.pulse * 50; // pixels per second at max pulse

    for (const entity of entities) {
      if (entity.position && entity.velocity) {
        // Apply upward drift based on pulse
        entity.velocity.y = -pulseVelocity * (1 - motion.flow);

        // Apply jitter
        if (motion.jitter > 0) {
          entity.velocity.x += (Math.random() - 0.5) * motion.jitter * 20;
        }

        // Update position based on velocity
        entity.position.x += entity.velocity.x * dt;
        entity.position.y += entity.velocity.y * dt;
      }
    }
  }

  private generateId(): EntityId {
    return `visual-particle-${this.ctx?.part ?? "unknown"}-${this.nextEntityId++}`;
  }
}
