/**
 * Pure generator: annotation manifest → Panel descriptor.
 *
 * The manifest is the source of truth for both MCP tool advertisement
 * and UI control rendering (SPEC 013 §UI Controls). This function
 * takes the manifest and produces the framework-free Panel shape a
 * renderer consumes.
 *
 * Grouping rules:
 *   - Input     — annotations whose id starts with "input:".
 *   - Basics    — session:* controls. Paired controls (session:key,
 *                 session:meter) render as a single PairWidget with
 *                 both children flattened out of the standalone list.
 *   - Advanced  — everything else (macros, cross-cutting). Subgrouped
 *                 by scope prefix — e.g. "harmony:", "rhythm:",
 *                 "dynamics:", "system:", plus a bare "General" bucket.
 *
 * Widgets that would appear twice (a pair member also listed on its
 * own) are deduplicated — the pair owns them.
 */

import type {
  MacroAnnotation,
  SessionControlAnnotation,
  ContinuousMacroAnnotation,
  DiscreteMacroAnnotation,
  CompoundMacroAnnotation,
  NumberSessionControlAnnotation,
  EnumSessionControlAnnotation,
  BooleanSessionControlAnnotation,
  PairSessionControlAnnotation,
} from "./annotations";
import type {
  Panel,
  PanelSection,
  PanelSubgroup,
  WidgetDescriptor,
  SliderWidgetDescriptor,
  SelectWidgetDescriptor,
  ToggleWidgetDescriptor,
  NumberWidgetDescriptor,
  PairWidgetDescriptor,
} from "./panel";

export interface ManifestForPanel {
  macros: MacroAnnotation[];
  sessionControls: SessionControlAnnotation[];
}

export function generatePanel(manifest: ManifestForPanel): Panel {
  const sessionById = new Map<string, SessionControlAnnotation>();
  for (const s of manifest.sessionControls) sessionById.set(s.id, s);

  // Session controls, minus the ones absorbed into pairs.
  const pairs = manifest.sessionControls.filter(
    (s): s is PairSessionControlAnnotation => s.type === "pair",
  );
  const absorbed = new Set<string>();
  for (const p of pairs) {
    absorbed.add(p.pair[0]);
    absorbed.add(p.pair[1]);
  }

  // ----- Input section -----
  const inputWidgets: WidgetDescriptor[] = manifest.sessionControls
    .filter((s) => s.id.startsWith("input:") && !absorbed.has(s.id))
    .map((s) => sessionWidget(s, sessionById));

  // ----- Basics (session:*) section -----
  // Pairs come out of sessionControls directly (their children are
  // absorbed into them by the absorbed-set above), so a single
  // filter+map handles standalone and pair widgets in source order.
  const basicsWidgets: WidgetDescriptor[] = manifest.sessionControls
    .filter((s) => s.id.startsWith("session:") && !absorbed.has(s.id))
    .map((s) => sessionWidget(s, sessionById));

  // ----- Advanced section: all macros, subgrouped by scope prefix -----
  const macroWidgets = manifest.macros.map(macroWidget);
  const advancedSubgroups = subgroupMacros(macroWidgets, manifest.macros);

  const sections: PanelSection[] = [
    { id: "input", title: "Input", widgets: inputWidgets, subgroups: [] },
    { id: "basics", title: "Basics", widgets: basicsWidgets, subgroups: [] },
    { id: "advanced", title: "Advanced", widgets: [], subgroups: advancedSubgroups },
  ];

  return { sections };
}

// ============================================================================
// Widget builders
// ============================================================================

function macroWidget(m: MacroAnnotation): WidgetDescriptor {
  const base = {
    id: m.id,
    label: m.name ?? m.id,
    tooltip: m.notes?.[0],
    aliases: m.aliases ?? [],
  };
  switch (m.type) {
    case "continuous":
      return continuousSlider(m, base);
    case "compound":
      return compoundSlider(m, base);
    case "discrete":
      return discreteSelect(m, base);
  }
}

function continuousSlider(
  m: ContinuousMacroAnnotation,
  base: WidgetBase,
): SliderWidgetDescriptor {
  return {
    ...base,
    kind: "slider",
    range: m.range,
    defaultValue: m.default,
    low: m.directionality.low.description,
    high: m.directionality.high.description,
  };
}

function compoundSlider(
  m: CompoundMacroAnnotation,
  base: WidgetBase,
): SliderWidgetDescriptor {
  return {
    ...base,
    kind: "slider",
    range: m.range,
    defaultValue: m.default,
    low: m.directionality.low.description,
    high: m.directionality.high.description,
  };
}

function discreteSelect(
  m: DiscreteMacroAnnotation,
  base: WidgetBase,
): SelectWidgetDescriptor {
  return {
    ...base,
    kind: "select",
    options: m.enumValues,
    defaultValue: m.default,
    clearable: false, // macros never take null
    dynamicOptions: false,
  };
}

function sessionWidget(
  s: SessionControlAnnotation,
  index: Map<string, SessionControlAnnotation>,
): WidgetDescriptor {
  const base = {
    id: s.id,
    label: s.name ?? s.id,
    tooltip: s.notes?.[0],
    aliases: s.aliases ?? [],
  };
  switch (s.type) {
    case "number":
      return numberField(s, base);
    case "enum":
      return enumSelect(s, base);
    case "boolean":
      return booleanToggle(s, base);
    case "pair":
      return pairWidget(s, index);
  }
}

function numberField(
  s: NumberSessionControlAnnotation,
  base: WidgetBase,
): NumberWidgetDescriptor {
  return {
    ...base,
    kind: "number",
    range: s.range,
    unit: s.unit,
    clearable: s.nullable,
  };
}

function enumSelect(
  s: EnumSessionControlAnnotation,
  base: WidgetBase,
): SelectWidgetDescriptor {
  const dyn = s.dynamicOptions === true;
  return {
    ...base,
    kind: "select",
    options: s.enumValues,
    // Session enum defaults aren't declared in the annotation; leave
    // the renderer to pick from state or first-option. Empty string
    // is the "unset" fallback (used by dynamicOptions widgets until
    // the renderer hydrates).
    defaultValue: dyn ? "" : (s.enumValues[0]?.value ?? ""),
    clearable: s.nullable,
    dynamicOptions: dyn,
  };
}

function booleanToggle(
  _s: BooleanSessionControlAnnotation,
  base: WidgetBase,
): ToggleWidgetDescriptor {
  return {
    ...base,
    kind: "toggle",
    defaultValue: false,
  };
}

function pairWidget(
  s: PairSessionControlAnnotation,
  index: Map<string, SessionControlAnnotation>,
): PairWidgetDescriptor {
  const [aId, bId] = s.pair;
  const a = index.get(aId);
  const b = index.get(bId);
  if (!a || !b) {
    throw new Error(
      `pair '${s.id}' references missing children: ${aId}, ${bId}`,
    );
  }
  // Build children as standalone widgets, then wrap. Children can't
  // themselves be pairs (nested pairs make no sense here) so the
  // recursion terminates one level in.
  return {
    id: s.id,
    label: s.name ?? s.id,
    tooltip: s.notes?.[0],
    aliases: s.aliases ?? [],
    kind: "pair",
    children: [sessionWidget(a, index), sessionWidget(b, index)],
    nullable: s.nullable,
  };
}

// ============================================================================
// Subgrouping: split Advanced by scope prefix (before the first ':')
// ============================================================================

const SCOPE_ORDER = ["harmony", "rhythm", "dynamics", "system"];

function subgroupMacros(
  widgets: WidgetDescriptor[],
  macros: MacroAnnotation[],
): PanelSubgroup[] {
  const byScope = new Map<string, WidgetDescriptor[]>();
  const generalId = "general";
  for (let i = 0; i < widgets.length; i++) {
    const w = widgets[i];
    const m = macros[i];
    const scope = scopeOf(m.id);
    const bucket = scope ?? generalId;
    let list = byScope.get(bucket);
    if (!list) {
      list = [];
      byScope.set(bucket, list);
    }
    list.push(w);
  }
  const ordered: PanelSubgroup[] = [];
  for (const scope of SCOPE_ORDER) {
    const list = byScope.get(scope);
    if (list && list.length > 0) {
      ordered.push({ id: scope, title: scopeTitle(scope), widgets: list });
      byScope.delete(scope);
    }
  }
  // General (unscoped) macros last.
  const general = byScope.get(generalId);
  if (general && general.length > 0) {
    ordered.push({ id: generalId, title: "General", widgets: general });
    byScope.delete(generalId);
  }
  // Any remaining scopes (novel prefixes) in insertion order.
  for (const [scope, list] of byScope) {
    ordered.push({ id: scope, title: scopeTitle(scope), widgets: list });
  }
  return ordered;
}

function scopeOf(id: string): string | null {
  const colon = id.indexOf(":");
  if (colon <= 0) return null;
  return id.slice(0, colon);
}

function scopeTitle(scope: string): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

type WidgetBase = {
  id: string;
  label: string;
  tooltip?: string;
  aliases: string[];
};
