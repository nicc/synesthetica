import type {
  IGrammar,
  GrammarContext,
  IntentFrame,
  SceneFrame,
  Entity,
  EntityId,
  Vec2,
} from "@synesthetica/contracts";

/**
 * Simple particle grammar: spawns a particle on each note_on event.
 *
 * For Phase 0:
 * - Each note_on creates a particle
 * - Position based on pitch (x) and octave (y)
 * - Color from palette intent
 * - Particles fade over time (TTL)
 */
export class ParticleGrammar implements IGrammar {
  readonly id = "particle";
  readonly paramsSchema = {
    particleTtlMs: { type: "number", default: 1000 },
    baseSize: { type: "number", default: 20 },
  };

  private ctx: GrammarContext | null = null;
  private nextEntityId = 0;
  private particleTtlMs = 1000;
  private baseSize = 20;

  init(ctx: GrammarContext): void {
    this.ctx = ctx;
    this.nextEntityId = 0;
  }

  update(input: IntentFrame, previous: SceneFrame | null): SceneFrame {
    if (!this.ctx) {
      throw new Error("ParticleGrammar not initialized");
    }

    const entities: Entity[] = [];
    const t = input.t;

    // Carry forward living particles from previous frame
    if (previous) {
      for (const entity of previous.entities) {
        if (entity.life) {
          const newAge = entity.life.ageMs + (t - previous.t);
          if (newAge < entity.life.ttlMs) {
            // Update age and opacity based on life
            const lifeProgress = newAge / entity.life.ttlMs;
            entities.push({
              ...entity,
              updatedAt: t,
              life: { ...entity.life, ageMs: newAge },
              style: {
                ...entity.style,
                opacity: 1 - lifeProgress,
              },
            });
          }
          // else: particle has expired, don't carry forward
        } else {
          // No life tracking, carry forward as-is
          entities.push({ ...entity, updatedAt: t });
        }
      }
    }

    // Find palette intent for color
    const paletteIntent = input.intents.find((i) => i.type === "palette");
    const baseColor = paletteIntent?.type === "palette"
      ? paletteIntent.base
      : { h: 0, s: 0.8, v: 0.8, a: 1 };

    // Spawn particles for note_on events
    for (const event of input.events) {
      if (event.type === "note_on") {
        const position = this.noteToPosition(event.note);
        const size = this.baseSize * (0.5 + (event.velocity / 127) * 0.5);

        const entity: Entity = {
          id: this.generateId(),
          part: event.part,
          kind: "particle",
          createdAt: t,
          updatedAt: t,
          position,
          velocity: { x: 0, y: -0.5 }, // Slight upward drift
          life: { ttlMs: this.particleTtlMs, ageMs: 0 },
          style: {
            color: baseColor,
            size,
            opacity: 1,
          },
          data: {
            note: event.note,
            velocity: event.velocity,
          },
        };

        entities.push(entity);
      }
    }

    return {
      t,
      entities,
      diagnostics: [],
    };
  }

  private noteToPosition(note: number): Vec2 {
    if (!this.ctx) {
      return { x: 0, y: 0 };
    }

    const { width, height } = this.ctx.canvasSize;
    const pc = note % 12;
    const octave = Math.floor(note / 12);

    // Spread notes horizontally by pitch class
    const x = (pc / 11) * (width * 0.8) + width * 0.1;

    // Spread notes vertically by octave (higher = higher on screen)
    const y = height - ((octave / 10) * (height * 0.8) + height * 0.1);

    return { x, y };
  }

  private generateId(): EntityId {
    return `particle-${this.ctx?.part ?? "unknown"}-${this.nextEntityId++}`;
  }
}
