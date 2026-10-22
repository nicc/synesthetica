import { describe, it, expect } from "vitest";
import {
  generatePanel,
  productionManifest,
  type MacroAnnotation,
  type Panel,
  type SessionControlAnnotation,
  type WidgetDescriptor,
} from "@synesthetica/contracts";

describe("generatePanel — sections", () => {
  it("always produces three sections in fixed order", () => {
    const panel = generatePanel(productionManifest);
    expect(panel.sections.map((s) => s.id)).toEqual(["input", "basics", "advanced"]);
  });

  it("Basics contains session:* controls (pairs absorb their children)", () => {
    const panel = generatePanel(productionManifest);
    const basics = panel.sections.find((s) => s.id === "basics")!;
    const ids = basics.widgets.map((w) => w.id);
    // Pairs render as composite widgets
    expect(ids).toContain("session:key");
    expect(ids).toContain("session:meter");
    // Standalone session controls
    expect(ids).toContain("session:tempo");
    expect(ids).toContain("session:chord-mode");
    expect(ids).toContain("session:metronome");
    // Pair children are NOT rendered standalone — they live inside the pair
    expect(ids).not.toContain("session:tonic");
    expect(ids).not.toContain("session:mode");
    expect(ids).not.toContain("session:beats-per-bar");
    expect(ids).not.toContain("session:beat-value");
  });

  it("Input section contains input:source with dynamicOptions", () => {
    const panel = generatePanel(productionManifest);
    const input = panel.sections.find((s) => s.id === "input")!;
    const source = input.widgets.find((w) => w.id === "input:source");
    expect(source).toBeDefined();
    expect(source!.kind).toBe("select");
    if (source && source.kind === "select") {
      expect(source.dynamicOptions).toBe(true);
      expect(source.options).toEqual([]);
    }
  });

  it("session:tonic is an enum with pitch-class labels (not raw 0–11)", () => {
    const panel = generatePanel(productionManifest);
    const key = findWidget(panel, "session:key");
    expect(key.kind).toBe("pair");
    if (key.kind !== "pair") return;
    const tonicChild = key.children.find((c) => c.id === "session:tonic")!;
    expect(tonicChild.kind).toBe("select");
    if (tonicChild.kind === "select") {
      const labels = tonicChild.options.map((o) => o.label);
      expect(labels).toContain("C");
      expect(labels).toContain("A");
      expect(tonicChild.options.map((o) => o.value)).toContain(9); // A = 9
    }
  });

  it("Advanced contains every macro subgrouped by scope prefix", () => {
    const panel = generatePanel(productionManifest);
    const advanced = panel.sections.find((s) => s.id === "advanced")!;
    // No standalone widgets at Advanced level — everything is subgrouped
    expect(advanced.widgets).toEqual([]);
    const scopes = advanced.subgroups.map((g) => g.id);
    expect(scopes).toContain("harmony");
    expect(scopes).toContain("rhythm");
    expect(scopes).toContain("dynamics");
    expect(scopes).toContain("system");
  });

  it("Advanced subgroups are ordered harmony → rhythm → dynamics → system → general", () => {
    const panel = generatePanel(productionManifest);
    const advanced = panel.sections.find((s) => s.id === "advanced")!;
    const ids = advanced.subgroups.map((g) => g.id);
    const harmonyIdx = ids.indexOf("harmony");
    const rhythmIdx = ids.indexOf("rhythm");
    const dynamicsIdx = ids.indexOf("dynamics");
    const systemIdx = ids.indexOf("system");
    expect(harmonyIdx).toBeLessThan(rhythmIdx);
    expect(rhythmIdx).toBeLessThan(dynamicsIdx);
    expect(dynamicsIdx).toBeLessThan(systemIdx);
  });

  it("bare (unscoped) macros land in 'General' subgroup", () => {
    const panel = generatePanel(productionManifest);
    const advanced = panel.sections.find((s) => s.id === "advanced")!;
    const general = advanced.subgroups.find((g) => g.id === "general");
    // time-horizon is a compound macro with no scope prefix
    expect(general).toBeDefined();
    expect(general!.widgets.map((w) => w.id)).toContain("time-horizon");
  });
});

describe("generatePanel — widget kinds", () => {
  // Widgets carry the annotation's shape through unchanged. Compare
  // against the manifest entry rather than retyping its range/default.
  it("continuous macro → slider with the annotation's range, default and directionality", () => {
    const ann = macroAnnotation("harmony:linger");
    if (ann.type !== "continuous") throw new Error("harmony:linger should be continuous");
    const linger = findWidget(generatePanel(productionManifest), ann.id);
    expect(linger.kind).toBe("slider");
    if (linger.kind === "slider") {
      expect(linger.range).toEqual(ann.range);
      expect(linger.defaultValue).toBe(ann.default);
      expect(linger.low).toBe(ann.directionality.low.description);
      expect(linger.high).toBe(ann.directionality.high.description);
    }
  });

  it("compound macro → slider (dispatch handled at engine, not renderer)", () => {
    const ann = macroAnnotation("time-horizon");
    if (ann.type !== "compound") throw new Error("time-horizon should be compound");
    const horizon = findWidget(generatePanel(productionManifest), ann.id);
    expect(horizon.kind).toBe("slider");
    if (horizon.kind === "slider") {
      expect(horizon.range).toEqual(ann.range);
      expect(horizon.defaultValue).toBe(ann.default);
    }
  });

  it("discrete macro → non-clearable select with the annotation's enum options", () => {
    const ann = macroAnnotation("rhythm:quantise-resolution");
    if (ann.type !== "discrete") throw new Error("rhythm:quantise-resolution should be discrete");
    const quantise = findWidget(generatePanel(productionManifest), ann.id);
    expect(quantise.kind).toBe("select");
    if (quantise.kind === "select") {
      expect(quantise.options.map((o) => o.value)).toEqual(ann.enumValues.map((v) => v.value));
      expect(quantise.defaultValue).toBe(ann.default);
      expect(quantise.clearable).toBe(false);
    }
  });

  it("nullable number session → number widget with clearable=true", () => {
    const ann = productionManifest.sessionControls.find((s) => s.id === "session:tempo");
    if (ann?.type !== "number") throw new Error("session:tempo should be a number control");
    expect(ann.nullable).toBe(true);
    const tempo = findWidget(generatePanel(productionManifest), ann.id);
    expect(tempo.kind).toBe("number");
    if (tempo.kind === "number") {
      expect(tempo.range).toEqual(ann.range);
      expect(tempo.unit).toBe(ann.unit);
      expect(tempo.clearable).toBe(true);
    }
  });

  it("enum session with nullable=true → select with clearable=true", () => {
    const ann = productionManifest.sessionControls.find((s) => s.id === "session:mode");
    if (ann?.type !== "enum") throw new Error("session:mode should be an enum control");
    const mode = findWidget(generatePanel(productionManifest), ann.id);
    expect(mode.kind).toBe("select");
    if (mode.kind === "select") {
      expect(mode.clearable).toBe(true);
      expect(mode.options.map((o) => o.value)).toEqual(ann.enumValues.map((v) => v.value));
    }
  });

  it("labels fall back to id when name is absent", () => {
    const manifest = {
      macros: [],
      sessionControls: [
        {
          id: "input:source",
          type: "enum" as const,
          enumValues: [{ value: "midi", label: "MIDI" }],
          nullable: false,
        },
      ] as SessionControlAnnotation[],
    };
    const panel = generatePanel(manifest);
    const input = findWidget(panel, "input:source");
    expect(input.label).toBe("input:source");
  });

  it("tooltip carries every entry from humanNotes[]", () => {
    const ann = productionManifest.sessionControls.find((s) => s.id === "session:tempo")!;
    expect(ann.humanNotes?.length).toBeGreaterThan(0);
    const tempo = findWidget(generatePanel(productionManifest), ann.id);
    expect(tempo.tooltip).toEqual(ann.humanNotes);
  });
});

describe("generatePanel — pair widgets", () => {
  it("PairSessionControlAnnotation renders as a pair with two children", () => {
    const macros: MacroAnnotation[] = [];
    const sessionControls: SessionControlAnnotation[] = [
      {
        id: "session:tonic",
        type: "number",
        range: [0, 11],
        unit: "pitch class",
        nullable: true,
      },
      {
        id: "session:mode",
        type: "enum",
        enumValues: [
          { value: "ionian", label: "major" },
          { value: "aeolian", label: "minor" },
        ],
        nullable: true,
      },
      {
        id: "session:key",
        name: "Key",
        type: "pair",
        pair: ["session:tonic", "session:mode"],
        nullable: true,
      },
    ];
    const panel = generatePanel({ macros, sessionControls });
    const basics = panel.sections.find((s) => s.id === "basics")!;
    const ids = basics.widgets.map((w) => w.id);
    // pair present
    expect(ids).toContain("session:key");
    // children absorbed — no standalone tonic/mode at basics top-level
    expect(ids).not.toContain("session:tonic");
    expect(ids).not.toContain("session:mode");

    const key = findWidget(panel, "session:key");
    expect(key.kind).toBe("pair");
    if (key.kind === "pair") {
      expect(key.children).toHaveLength(2);
      expect(key.children[0].id).toBe("session:tonic");
      expect(key.children[1].id).toBe("session:mode");
    }
  });

  it("throws when a pair references a missing child", () => {
    expect(() =>
      generatePanel({
        macros: [],
        sessionControls: [
          {
            id: "session:key",
            type: "pair",
            pair: ["session:tonic", "session:mode"],
            nullable: true,
          },
        ],
      }),
    ).toThrow(/missing children/);
  });
});

function macroAnnotation(id: string): MacroAnnotation {
  const ann = productionManifest.macros.find((m) => m.id === id);
  if (!ann) throw new Error(`macro not in manifest: ${id}`);
  return ann;
}

function findWidget(panel: Panel, id: string): WidgetDescriptor {
  const search = (widgets: readonly WidgetDescriptor[]): WidgetDescriptor | null => {
    for (const w of widgets) {
      if (w.id === id) return w;
      if (w.kind === "pair") {
        const found = search(w.children);
        if (found) return found;
      }
    }
    return null;
  };
  for (const section of panel.sections) {
    const found = search(section.widgets) ?? search(section.subgroups.flatMap((sg) => sg.widgets));
    if (found) return found;
  }
  throw new Error(`widget not found: ${id}`);
}
