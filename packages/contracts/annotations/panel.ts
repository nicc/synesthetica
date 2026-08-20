/**
 * UI panel descriptors — the typed shape a renderer consumes to build
 * a control panel from an annotation manifest. Framework-free: the CLI
 * generator and the web-app renderer both operate on this shape, so
 * the manifest stays the single source of truth (SPEC 013 §UI Controls).
 *
 * A WidgetDescriptor tells a renderer *what* to render — kind, id,
 * label, tooltip, range/enum values, current value. It does NOT tell
 * the renderer *how* — colour, layout, styling are the renderer's job.
 *
 * A Panel groups widgets into three sections per SPEC 013:
 *   - Input     — input:* namespace
 *   - Basics    — session:* namespace (pair-grouped where relevant)
 *   - Advanced  — everything else, subgrouped by scope prefix
 */

export type WidgetKind = "slider" | "select" | "toggle" | "number" | "pair";

/**
 * Fields common to every widget shape. The renderer uses `id` when
 * dispatching change events back to the engine.
 */
interface WidgetDescriptorBase {
  kind: WidgetKind;
  /** Annotation id (e.g. "harmony:linger", "session:tempo"). */
  id: string;
  /** Display label from annotation.name (falls back to id). */
  label: string;
  /** Tooltip from annotation.notes[0] when present. */
  tooltip?: string;
  /** Non-primary names from annotation.aliases, for the filter input. */
  aliases: string[];
}

/**
 * Slider — continuous or compound macro. `range` is the input space
 * the widget spans; the current value from state is applied by the
 * renderer at bind time.
 */
export interface SliderWidgetDescriptor extends WidgetDescriptorBase {
  kind: "slider";
  range: [number, number];
  defaultValue: number;
  /** Directionality prose for the low/high extremes; render as endpoints. */
  low: string;
  high: string;
}

/**
 * Select — discrete macro or enum session control. Value can be
 * string or number depending on the annotation.
 */
export interface SelectWidgetDescriptor extends WidgetDescriptorBase {
  kind: "select";
  options: Array<{ value: string | number; label: string }>;
  defaultValue: string | number;
  /** True when this control accepts null (session enum with nullable=true). */
  clearable: boolean;
  /**
   * When true, `options` is a shape declaration only — the renderer
   * must populate the actual list at bind time (e.g. input:source
   * device list). If the renderer has no hydration source, the
   * widget renders empty with a hint.
   */
  dynamicOptions: boolean;
}

/**
 * Toggle — boolean session control. Always non-nullable.
 */
export interface ToggleWidgetDescriptor extends WidgetDescriptorBase {
  kind: "toggle";
  defaultValue: boolean;
}

/**
 * Number input — nullable numeric session control (e.g. session:tempo).
 * `clearable` mirrors the annotation's `nullable` field.
 */
export interface NumberWidgetDescriptor extends WidgetDescriptorBase {
  kind: "number";
  range: [number, number];
  unit?: string;
  clearable: boolean;
}

/**
 * Pair — composite widget grouping two related session controls. The
 * children are full WidgetDescriptors so the renderer can lay them out
 * as a unit (e.g. "Key: [root] [mode]"). The pair widget's own id is
 * the pair annotation id (e.g. "session:key"); the children carry their
 * own ids for dispatch.
 */
export interface PairWidgetDescriptor extends WidgetDescriptorBase {
  kind: "pair";
  children: [WidgetDescriptor, WidgetDescriptor];
}

export type WidgetDescriptor =
  | SliderWidgetDescriptor
  | SelectWidgetDescriptor
  | ToggleWidgetDescriptor
  | NumberWidgetDescriptor
  | PairWidgetDescriptor;

/**
 * A named subgroup within a section (e.g. Advanced → "harmony:" widgets).
 * Only Advanced uses subgroups; other sections leave the array empty
 * and put widgets directly in `widgets`.
 */
export interface PanelSubgroup {
  id: string;
  title: string;
  widgets: WidgetDescriptor[];
}

export interface PanelSection {
  id: "input" | "basics" | "advanced";
  title: string;
  widgets: WidgetDescriptor[];
  subgroups: PanelSubgroup[];
}

export interface Panel {
  sections: PanelSection[];
}
