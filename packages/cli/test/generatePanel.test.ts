import { describe, it, expect } from "vitest";
import {
  generatePanel,
  type MacroAnnotation,
  type SessionControlAnnotation,
} from "@synesthetica/contracts";
import { smokeTestManifest } from "../src/annotations/manifest.js";

describe("generatePanel — sections", () => {
  it("always produces three sections in fixed order", () => {
    const panel = generatePanel(smokeTestManifest);
    expect(panel.sections.map((s) => s.id)).toEqual(["input", "basics", "advanced"]);
  });

  it("Basics contains session:* controls", () => {
    const panel = generatePanel(smokeTestManifest);
    const basics = panel.sections.find((s) => s.id === "basics")!;
    const ids = basics.widgets.map((w) => w.id);
    expect(ids).toContain("session:tonic");
    expect(ids).toContain("session:tempo");
    expect(ids).toContain("session:mode");
  });

  it("Advanced contains every macro subgrouped by scope prefix", () => {
    const panel = generatePanel(smokeTestManifest);
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
    const panel = generatePanel(smokeTestManifest);
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
    const panel = generatePanel(smokeTestManifest);
    const advanced = panel.sections.find((s) => s.id === "advanced")!;
    const general = advanced.subgroups.find((g) => g.id === "general");
    // time-horizon is a compound macro with no scope prefix
    expect(general).toBeDefined();
    expect(general!.widgets.map((w) => w.id)).toContain("time-horizon");
  });
});

describe("generatePanel — widget kinds", () => {
  it("continuous macro → slider with range and directionality", () => {
    const panel = generatePanel(smokeTestManifest);
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
    const panel = generatePanel(smokeTestManifest);
    const horizon = findWidget(panel, "time-horizon");
    expect(horizon.kind).toBe("slider");
    if (horizon.kind === "slider") {
      expect(horizon.range).toEqual([0, 1]);
      expect(horizon.defaultValue).toBe(1);
    }
  });

  it("discrete macro → select with enum options", () => {
    const panel = generatePanel(smokeTestManifest);
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
    const panel = generatePanel(smokeTestManifest);
    const tempo = findWidget(panel, "session:tempo");
    expect(tempo.kind).toBe("number");
    if (tempo.kind === "number") {
      expect(tempo.range).toEqual([30, 240]);
      expect(tempo.unit).toBe("BPM");
      expect(tempo.clearable).toBe(true);
    }
  });

  it("enum session with nullable=true → select with clearable=true", () => {
    const panel = generatePanel(smokeTestManifest);
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

  it("tooltip comes from notes[0]", () => {
    const panel = generatePanel(smokeTestManifest);
    const tempo = findWidget(panel, "session:tempo");
    expect(tempo.tooltip).toContain("grid");
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
  tooltip?: string;
  aliases: string[];
  [k: string]: unknown;
} {
  for (const section of panel.sections) {
    for (const w of section.widgets) if (w.id === id) return w;
    for (const sg of section.subgroups) {
      for (const w of sg.widgets) if (w.id === id) return w;
    }
  }
  throw new Error(`widget not found: ${id}`);
}
