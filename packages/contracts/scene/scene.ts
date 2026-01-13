import type { Ms } from "../core/time";
import type { PartId } from "../parts/parts";
import type { ColorHSVA } from "../intents/colors";

export type EntityId = string;

export interface Vec2 { x: number; y: number; }

export interface Style {
  color?: ColorHSVA;
  size?: number;
  opacity?: number;
  textureId?: string;
}

export type EntityKind = "particle" | "trail" | "field" | "glyph" | "group";

export interface Entity {
  id: EntityId;
  part: PartId;
  kind: EntityKind;
  createdAt: Ms;
  updatedAt: Ms;

  position?: Vec2;
  velocity?: Vec2;
  life?: { ttlMs: Ms; ageMs: Ms };

  style: Style;
  data?: Record<string, unknown>;
}

export interface SceneFrame {
  t: Ms;
  entities: Entity[];
}
