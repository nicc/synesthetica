// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generatePanel, productionManifest } from "@synesthetica/contracts";
import { renderPanel } from "../src/panel/renderPanel.js";

// Popups are appended to document.body (fixed-positioned so ancestor
// overflow doesn't clip them). Clear between tests so accumulation
// doesn't confuse assertions that query the body.
beforeEach(() => {
  document.body.innerHTML = "";
});

describe("renderPanel — structure", () => {
  it("renders three sections in order", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch: () => {} });
    const sections = rendered.root.querySelectorAll(".syn-panel-section");
    expect(sections).toHaveLength(3);
    expect(sections[0].getAttribute("data-section-id")).toBe("input");
    expect(sections[1].getAttribute("data-section-id")).toBe("basics");
    expect(sections[2].getAttribute("data-section-id")).toBe("advanced");
  });

  it("renders a widget for every macro under Advanced subgroups", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch: () => {} });
    const advanced = rendered.root.querySelector(
      '.syn-panel-section[data-section-id="advanced"]',
    )!;
    const widgetIds = Array.from(
      advanced.querySelectorAll("[data-widget-id]"),
    ).map((el) => el.getAttribute("data-widget-id"));
    // Every macro id appears
    for (const m of productionManifest.macros) {
      expect(widgetIds).toContain(m.id);
    }
  });
});

describe("renderPanel — widget interactions", () => {
  it("slider dispatches numeric value on input", () => {
    const dispatch = vi.fn();
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch });
    const linger = rendered.root.querySelector(
      '[data-widget-id="harmony:linger"] input[type="range"]',
    ) as HTMLInputElement;
    expect(linger).toBeTruthy();
    linger.value = "5";
    linger.dispatchEvent(new Event("input"));
    expect(dispatch).toHaveBeenCalledWith("harmony:linger", 5);
  });

  it("select dispatches typed value on change (string enum)", () => {
    const dispatch = vi.fn();
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch });
    const quantise = rendered.root.querySelector(
      '[data-widget-id="rhythm:quantise-resolution"] select',
    ) as HTMLSelectElement;
    expect(quantise).toBeTruthy();
    quantise.value = "32nd";
    quantise.dispatchEvent(new Event("change"));
    expect(dispatch).toHaveBeenCalledWith("rhythm:quantise-resolution", "32nd");
  });

  it("nullable number widget dispatches null when cleared", () => {
    const dispatch = vi.fn();
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch });
    const clear = rendered.root.querySelector(
      '[data-widget-id="session:tempo"] .syn-panel-widget-clear',
    ) as HTMLButtonElement;
    expect(clear).toBeTruthy();
    clear.click();
    expect(dispatch).toHaveBeenCalledWith("session:tempo", null);
  });

  it("number widget dispatches numeric value on change", () => {
    const dispatch = vi.fn();
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch });
    const tempo = rendered.root.querySelector(
      '[data-widget-id="session:tempo"] input[type="number"]',
    ) as HTMLInputElement;
    tempo.value = "120";
    tempo.dispatchEvent(new Event("change"));
    expect(dispatch).toHaveBeenCalledWith("session:tempo", 120);
  });

  it("clearable select dispatches null for '—' option", () => {
    const dispatch = vi.fn();
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch });
    const mode = rendered.root.querySelector(
      '[data-widget-id="session:mode"] select',
    ) as HTMLSelectElement;
    mode.value = "";
    mode.dispatchEvent(new Event("change"));
    expect(dispatch).toHaveBeenCalledWith("session:mode", null);
  });
});

describe("renderPanel — nullable pair Clear buttons null both children", () => {
  it("clicking Clear on beats-per-bar also nulls beat-value", () => {
    const dispatched: Array<[string, unknown]> = [];
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({
      panel,
      dispatch: (id, v) => dispatched.push([id, v]),
    });
    // Both children live inside the meter pair.
    const meter = rendered.root.querySelector(
      '[data-widget-id="session:meter"]',
    ) as HTMLElement;
    const bpbClear = meter.querySelector(
      '[data-widget-id="session:beats-per-bar"] .syn-panel-widget-clear',
    ) as HTMLButtonElement;
    expect(bpbClear).toBeTruthy();
    bpbClear.click();
    // Both children nulled by one click on either child's Clear.
    const nulls = dispatched.filter(([, v]) => v === null).map(([id]) => id);
    expect(nulls).toContain("session:beats-per-bar");
    expect(nulls).toContain("session:beat-value");
  });

  it("clicking Clear on beat-value also nulls beats-per-bar", () => {
    const dispatched: Array<[string, unknown]> = [];
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({
      panel,
      dispatch: (id, v) => dispatched.push([id, v]),
    });
    const meter = rendered.root.querySelector(
      '[data-widget-id="session:meter"]',
    ) as HTMLElement;
    const bvClear = meter.querySelector(
      '[data-widget-id="session:beat-value"] .syn-panel-widget-clear',
    ) as HTMLButtonElement;
    expect(bvClear).toBeTruthy();
    bvClear.click();
    const nulls = dispatched.filter(([, v]) => v === null).map(([id]) => id);
    expect(nulls).toContain("session:beats-per-bar");
    expect(nulls).toContain("session:beat-value");
  });

  it("clickable Clear appears on each nullable pair child (key + meter)", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch: () => {} });
    // Key pair — tonic + mode, both clearable selects.
    const key = rendered.root.querySelector(
      '[data-widget-id="session:key"]',
    ) as HTMLElement;
    expect(
      key.querySelectorAll(".syn-panel-widget-clear").length,
    ).toBeGreaterThanOrEqual(2);
    // Meter pair — bpb + beat-value.
    const meter = rendered.root.querySelector(
      '[data-widget-id="session:meter"]',
    ) as HTMLElement;
    expect(
      meter.querySelectorAll(".syn-panel-widget-clear").length,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe("renderPanel — hover-help", () => {
  it("adds a '?' hover-help element for sliders with directionality", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch: () => {} });
    // harmony:linger is a continuous macro with directionality
    const w = rendered.root.querySelector(
      '[data-widget-id="harmony:linger"]',
    ) as HTMLElement;
    const help = w.querySelector(".syn-panel-widget-help") as HTMLElement;
    expect(help).toBeTruthy();
    expect(help.textContent?.startsWith("?")).toBe(true);
    // Popup lives on document.body (fixed-positioned, escapes clip
    // ancestors). Grab the last help panel — one per '?' created.
    const panels = document.body.querySelectorAll(
      ".syn-panel-widget-help-panel",
    );
    expect(panels.length).toBeGreaterThan(0);
    const bodies = Array.from(panels).map((p) =>
      Array.from(p.querySelectorAll("dt")).map((dt) => dt.textContent),
    );
    // At least one panel carries the low/high endpoints.
    expect(bodies.some((b) => b.includes("Low") && b.includes("High"))).toBe(true);
  });

  it("does not render inline hints line under the widget row", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch: () => {} });
    expect(rendered.root.querySelector(".syn-panel-widget-hints")).toBeNull();
  });

  it("skips the '?' when a widget has no tooltip and no endpoints", () => {
    const panel = generatePanel({
      macros: [],
      sessionControls: [
        {
          id: "session:metronome",
          name: "Metronome",
          type: "boolean",
          nullable: false,
        },
      ],
    });
    const rendered = renderPanel({ panel, dispatch: () => {} });
    const w = rendered.root.querySelector(
      '[data-widget-id="session:metronome"]',
    ) as HTMLElement;
    expect(w.querySelector(".syn-panel-widget-help")).toBeNull();
  });
});

describe("renderPanel — dynamic options hydration", () => {
  it("renders empty select with placeholder when no optionsFor is provided", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch: () => {} });
    const select = rendered.root.querySelector(
      '[data-widget-id="input:source"] select',
    ) as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.disabled).toBe(true);
    // Placeholder option present
    expect(select.querySelector("option")!.textContent).toBe("(none available)");
  });

  it("populates dynamic-options widget from optionsFor hydrator", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({
      panel,
      dispatch: () => {},
      optionsFor: (id) => {
        if (id === "input:source") {
          return [
            { value: "midi:0", label: "Yamaha P-125" },
            { value: "audio:default", label: "Built-in microphone" },
          ];
        }
        return undefined;
      },
    });
    const select = rendered.root.querySelector(
      '[data-widget-id="input:source"] select',
    ) as HTMLSelectElement;
    expect(select.disabled).toBe(false);
    const optionLabels = Array.from(select.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(optionLabels).toContain("Yamaha P-125");
    expect(optionLabels).toContain("Built-in microphone");
  });

  it("dispatch fires source value when a hydrated option is picked", () => {
    const dispatch = vi.fn();
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({
      panel,
      dispatch,
      optionsFor: (id) =>
        id === "input:source"
          ? [{ value: "midi:0", label: "Piano" }]
          : undefined,
    });
    const select = rendered.root.querySelector(
      '[data-widget-id="input:source"] select',
    ) as HTMLSelectElement;
    select.value = "midi:0";
    select.dispatchEvent(new Event("change"));
    expect(dispatch).toHaveBeenCalledWith("input:source", "midi:0");
  });
});

describe("renderPanel — initial values + update()", () => {
  it("initial value overrides descriptor default on render", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({
      panel,
      dispatch: () => {},
      initialValues: { "harmony:linger": 7 },
    });
    const linger = rendered.root.querySelector(
      '[data-widget-id="harmony:linger"] input[type="range"]',
    ) as HTMLInputElement;
    expect(linger.value).toBe("7");
  });

  it("update() refreshes widget values without re-rendering", () => {
    const panel = generatePanel(productionManifest);
    const rendered = renderPanel({ panel, dispatch: () => {} });
    const linger = rendered.root.querySelector(
      '[data-widget-id="harmony:linger"] input[type="range"]',
    ) as HTMLInputElement;
    rendered.update({ "harmony:linger": 6 });
    expect(linger.value).toBe("6");
  });
});
