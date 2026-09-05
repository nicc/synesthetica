import { describe, it, expect } from "vitest";
import {
  generatePanel,
  productionManifest,
  type MacroAnnotation,
  type SessionControlAnnotation,
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
  it("continuous macro → slider with range and directionality", () => {
    const panel = generatePanel(productionManifest);
    const linger = findWidget(panel, "harmony:linger");
    expect(linger.kind).toBe("slider");
    if (linger.kind === "slider") {
      expect(linger.range).toEqual([0.5, 8]);
      expect(linger.defaultValue).toBe(3);
      expect(linger.low).toMatch(/quickly/);
      expect(linger.high).toMatch(/linger/);
    }
  });

  it("compound macro → slider (dispatch handled at engine, not renderer)", () => {
    const panel = generatePanel(productionManifest);
    const horizon = findWidget(panel, "time-horizon");
    expect(horizon.kind).toBe("slider");
    if (horizon.kind === "slider") {
      expect(horizon.range).toEqual([0, 1]);
      expect(horizon.defaultValue).toBe(1);
    }
  });

  it("discrete macro → select with enum options", () => {
    const panel = generatePanel(productionManifest);
    const quantise = findWidget(panel, "rhythm:quantise-resolution");
    expect(quantise.kind).toBe("select");
    if (quantise.kind === "select") {
      expect(quantise.options.map((o) => o.value)).toContain("16th");
      expect(quantise.options.map((o) => o.value)).toContain("32nd");
      expect(quantise.defaultValue).toBe("16th");
      expect(quantise.clearable).toBe(false);
    }
  });

  it("nullable number session → number widget with clearable=true", () => {
    const panel = generatePanel(productionManifest);
    const tempo = findWidget(panel, "session:tempo");
    expect(tempo.kind).toBe("number");
    if (tempo.kind === "number") {
      expect(tempo.range).toEqual([30, 240]);
      expect(tempo.unit).toBe("BPM");
      expect(tempo.clearable).toBe(true);
    }
  });

  it("enum session with nullable=true → select with clearable=true", () => {
    const panel = generatePanel(productionManifest);
    const mode = findWidget(panel, "session:mode");
    expect(mode.kind).toBe("select");
    if (mode.kind === "select") {
      expect(mode.clearable).toBe(true);
      expect(mode.options.map((o) => o.value)).toContain("ionian");
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

  it("tooltip carries every entry from notes[]", () => {
    const panel = generatePanel(productionManifest);
    const tempo = findWidget(panel, "session:tempo");
    expect(Array.isArray(tempo.tooltip)).toBe(true);
    // Should include the "grid" note verbatim as one of the paragraphs.
    expect((tempo.tooltip as string[]).some((n) => n.includes("grid"))).toBe(true);
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

function findWidget(
  panel: ReturnType<typeof generatePanel>,
  id: string,
): {
  kind: "slider" | "select" | "toggle" | "number" | "pair";
  id: string;
  label: string;
  tooltip?: string[];
  aliases: string[];
  [k: string]: unknown;
} {
  const search = (widgets: readonly { id: string; kind: string; [k: string]: unknown }[]): typeof widgets[number] | null => {
    for (const w of widgets) {
      if (w.id === id) return w;
      if (w.kind === "pair") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const found = search((w as any).children);
        if (found) return found;
      }
    }
    return null;
  };
  for (const section of panel.sections) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inTop = search(section.widgets as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (inTop) return inTop as any;
    for (const sg of section.subgroups) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inSg = search(sg.widgets as any);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (inSg) return inSg as any;
    }
  }
  throw new Error(`widget not found: ${id}`);
}
