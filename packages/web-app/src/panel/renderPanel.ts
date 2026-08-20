/**
 * Renders a generated Panel descriptor into a DOM tree, wiring
 * user-driven changes back through a dispatch function.
 *
 * SPEC 013 §UI Controls promises the panel is auto-generated from the
 * annotation manifest, and that user + LLM operate on the same control
 * surface. This function is the direct-manual half — a pure DOM
 * builder consuming the framework-free Panel shape from
 * @synesthetica/contracts.
 *
 * The renderer does NOT know about the engine, the pipeline, or the
 * MCP layer. It calls `dispatch(id, value)` when the user interacts
 * with a widget; the caller wires that to whatever engine adapter is
 * appropriate (BrowserEngineHandle locally, or something else later).
 */

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
} from "@synesthetica/contracts";

/**
 * Value payload the renderer emits. `null` is only ever emitted from
 * clearable widgets; downstream must handle it (typically by clearing
 * the underlying session control).
 */
export type PanelDispatchValue = string | number | boolean | null;

export type PanelDispatch = (id: string, value: PanelDispatchValue) => void;

export interface RenderPanelOptions {
  panel: Panel;
  dispatch: PanelDispatch;
  /**
   * Current values for widgets, keyed by widget id. Missing entries
   * fall back to the descriptor's `defaultValue` for widgets that
   * carry one; otherwise the widget renders in its unset state.
   */
  initialValues?: Record<string, PanelDispatchValue>;
}

/**
 * Build the root panel DOM element. Caller appends it into the app.
 * The returned object also exposes an `update()` method to refresh
 * widget values from a new state snapshot without re-rendering.
 */
export interface RenderedPanel {
  root: HTMLElement;
  /** Refresh widget values from a new state snapshot (e.g. after MCP tool call). */
  update(values: Record<string, PanelDispatchValue>): void;
}

export function renderPanel(opts: RenderPanelOptions): RenderedPanel {
  const root = document.createElement("div");
  root.className = "syn-panel";

  // Per-widget updater — records how to refresh the widget's DOM from
  // a new value. Used by update() below.
  const updaters = new Map<string, (v: PanelDispatchValue) => void>();

  for (const section of opts.panel.sections) {
    root.appendChild(renderSection(section, opts, updaters));
  }

  return {
    root,
    update(values) {
      for (const [id, v] of Object.entries(values)) {
        const fn = updaters.get(id);
        if (fn) fn(v);
      }
    },
  };
}

function renderSection(
  section: PanelSection,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  const wrap = document.createElement("section");
  wrap.className = `syn-panel-section syn-panel-section-${section.id}`;
  wrap.dataset.sectionId = section.id;

  const header = document.createElement("h3");
  header.className = "syn-panel-section-title";
  header.textContent = section.title;
  wrap.appendChild(header);

  // Widgets directly under a section (used for Input / Basics).
  for (const w of section.widgets) {
    wrap.appendChild(renderWidget(w, opts, updaters));
  }

  // Subgroups (used for Advanced).
  for (const sg of section.subgroups) {
    wrap.appendChild(renderSubgroup(sg, opts, updaters));
  }

  return wrap;
}

function renderSubgroup(
  sg: PanelSubgroup,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "syn-panel-subgroup";
  wrap.dataset.subgroupId = sg.id;

  const header = document.createElement("h4");
  header.className = "syn-panel-subgroup-title";
  header.textContent = sg.title;
  wrap.appendChild(header);

  for (const w of sg.widgets) {
    wrap.appendChild(renderWidget(w, opts, updaters));
  }
  return wrap;
}

function renderWidget(
  w: WidgetDescriptor,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  switch (w.kind) {
    case "slider":
      return renderSlider(w, opts, updaters);
    case "select":
      return renderSelect(w, opts, updaters);
    case "toggle":
      return renderToggle(w, opts, updaters);
    case "number":
      return renderNumber(w, opts, updaters);
    case "pair":
      return renderPair(w, opts, updaters);
  }
}

function widgetShell(w: WidgetDescriptor): HTMLElement {
  const el = document.createElement("div");
  el.className = `syn-panel-widget syn-panel-widget-${w.kind}`;
  el.dataset.widgetId = w.id;
  if (w.tooltip) el.title = w.tooltip;

  const label = document.createElement("label");
  label.className = "syn-panel-widget-label";
  label.textContent = w.label;
  label.htmlFor = domId(w.id);
  el.appendChild(label);
  return el;
}

function domId(widgetId: string): string {
  // DOM ids can't contain colons in some CSS selectors — normalise.
  return `syn-w-${widgetId.replace(/[:.]/g, "-")}`;
}

function initialFor<T extends PanelDispatchValue>(
  opts: RenderPanelOptions,
  id: string,
  fallback: T,
): T | PanelDispatchValue {
  const v = opts.initialValues?.[id];
  return v === undefined ? fallback : v;
}

function renderSlider(
  w: SliderWidgetDescriptor,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  const el = widgetShell(w);
  const input = document.createElement("input");
  input.type = "range";
  input.id = domId(w.id);
  input.min = String(w.range[0]);
  input.max = String(w.range[1]);
  // Continuous macros often benefit from finer granularity than integers.
  input.step = "any";
  const initial = Number(initialFor(opts, w.id, w.defaultValue));
  input.value = String(initial);

  const valueLabel = document.createElement("span");
  valueLabel.className = "syn-panel-widget-value";
  valueLabel.textContent = formatSliderValue(initial);

  input.addEventListener("input", () => {
    const v = Number(input.value);
    valueLabel.textContent = formatSliderValue(v);
    opts.dispatch(w.id, v);
  });

  el.appendChild(input);
  el.appendChild(valueLabel);

  // Endpoint hints from directionality prose.
  if (w.low || w.high) {
    const hints = document.createElement("div");
    hints.className = "syn-panel-widget-hints";
    hints.textContent = `${w.low} · ${w.high}`;
    el.appendChild(hints);
  }

  updaters.set(w.id, (v) => {
    if (typeof v !== "number") return;
    input.value = String(v);
    valueLabel.textContent = formatSliderValue(v);
  });

  return el;
}

function formatSliderValue(v: number): string {
  // Three-significant-digit format — 3, 3.14, 0.00512, etc.
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(0);
  if (abs >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

function renderSelect(
  w: SelectWidgetDescriptor,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  const el = widgetShell(w);
  const select = document.createElement("select");
  select.id = domId(w.id);

  if (w.clearable) {
    const clear = document.createElement("option");
    clear.value = "";
    clear.textContent = "—";
    select.appendChild(clear);
  }
  for (const opt of w.options) {
    const option = document.createElement("option");
    option.value = String(opt.value);
    option.textContent = opt.label;
    select.appendChild(option);
  }

  const initial = initialFor(opts, w.id, w.defaultValue);
  select.value = initial === null ? "" : String(initial);

  select.addEventListener("change", () => {
    if (w.clearable && select.value === "") {
      opts.dispatch(w.id, null);
    } else {
      // Convert back to number if the descriptor's options were numeric.
      const opt = w.options.find((o) => String(o.value) === select.value);
      opts.dispatch(w.id, opt ? opt.value : select.value);
    }
  });

  el.appendChild(select);

  updaters.set(w.id, (v) => {
    select.value = v === null || v === undefined ? "" : String(v);
  });

  return el;
}

function renderToggle(
  w: ToggleWidgetDescriptor,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  const el = widgetShell(w);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = domId(w.id);
  const initial = Boolean(initialFor(opts, w.id, w.defaultValue));
  input.checked = initial;

  input.addEventListener("change", () => {
    opts.dispatch(w.id, input.checked);
  });

  el.appendChild(input);

  updaters.set(w.id, (v) => {
    input.checked = Boolean(v);
  });

  return el;
}

function renderNumber(
  w: NumberWidgetDescriptor,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  const el = widgetShell(w);
  const input = document.createElement("input");
  input.type = "number";
  input.id = domId(w.id);
  input.min = String(w.range[0]);
  input.max = String(w.range[1]);
  const initial = initialFor(opts, w.id, null);
  input.value = initial === null || initial === undefined ? "" : String(initial);

  input.addEventListener("change", () => {
    if (input.value === "") {
      if (w.clearable) opts.dispatch(w.id, null);
      // Non-clearable + empty is refused (fallback to previous value).
      return;
    }
    const v = Number(input.value);
    if (!Number.isFinite(v)) return;
    opts.dispatch(w.id, v);
  });

  el.appendChild(input);
  if (w.unit) {
    const unit = document.createElement("span");
    unit.className = "syn-panel-widget-unit";
    unit.textContent = w.unit;
    el.appendChild(unit);
  }

  if (w.clearable) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "syn-panel-widget-clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      input.value = "";
      opts.dispatch(w.id, null);
    });
    el.appendChild(clearBtn);
  }

  updaters.set(w.id, (v) => {
    input.value = v === null || v === undefined ? "" : String(v);
  });

  return el;
}

function renderPair(
  w: PairWidgetDescriptor,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
): HTMLElement {
  const el = document.createElement("div");
  el.className = "syn-panel-widget syn-panel-widget-pair";
  el.dataset.widgetId = w.id;
  if (w.tooltip) el.title = w.tooltip;

  const label = document.createElement("div");
  label.className = "syn-panel-widget-label";
  label.textContent = w.label;
  el.appendChild(label);

  const row = document.createElement("div");
  row.className = "syn-panel-widget-pair-children";
  for (const child of w.children) {
    row.appendChild(renderWidget(child, opts, updaters));
  }
  el.appendChild(row);
  return el;
}
