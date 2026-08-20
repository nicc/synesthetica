// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { generatePanel, productionManifest } from "@synesthetica/contracts";
import { renderPanel } from "../src/panel/renderPanel.js";

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
