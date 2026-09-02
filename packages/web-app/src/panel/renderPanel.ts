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
  /**
   * Hydrator for widgets with `dynamicOptions: true`. Called at bind
   * time with the widget id; returns the list of options to render.
   * When absent, dynamic-options widgets render empty (with a hint).
   */
  optionsFor?: (widgetId: string) => Array<{ value: string | number; label: string }> | undefined;
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
  /**
   * Replace the option list for a dynamic-options widget. Used when
   * the underlying source hydrates late (e.g. Web MIDI enumeration
   * completes after the panel is rendered).
   */
  updateOptions(
    widgetId: string,
    options: Array<{ value: string | number; label: string }>,
  ): void;
}

/**
 * Options for renderPanel that additionally scope rendering to a
 * subset of the manifest's sections. When omitted, all sections
 * render.
 */
export interface RenderPanelSubsetOptions extends RenderPanelOptions {
  sectionIds?: readonly string[];
}

export function renderPanel(opts: RenderPanelSubsetOptions): RenderedPanel;
export function renderPanel(opts: RenderPanelOptions): RenderedPanel;
export function renderPanel(opts: RenderPanelSubsetOptions): RenderedPanel {
  const root = document.createElement("div");
  root.className = "syn-panel";

  // Per-widget updater — records how to refresh the widget's DOM from
  // a new value. Used by update() below.
  const updaters = new Map<string, (v: PanelDispatchValue) => void>();
  // Per-widget option-list updater for dynamic-options selects.
  const optionUpdaters = new Map<
    string,
    (options: Array<{ value: string | number; label: string }>) => void
  >();

  const wantedIds = opts.sectionIds
    ? new Set<string>(opts.sectionIds)
    : null;
  for (const section of opts.panel.sections) {
    if (wantedIds && !wantedIds.has(section.id)) continue;
    root.appendChild(renderSection(section, opts, updaters, optionUpdaters));
  }

  return {
    root,
    update(values) {
      for (const [id, v] of Object.entries(values)) {
        const fn = updaters.get(id);
        if (fn) fn(v);
      }
    },
    updateOptions(widgetId, options) {
      const fn = optionUpdaters.get(widgetId);
      if (fn) fn(options);
    },
  };
}

function renderSection(
  section: PanelSection,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
  optionUpdaters: Map<string, (options: Array<{ value: string | number; label: string }>) => void>,
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
    wrap.appendChild(renderWidget(w, opts, updaters, optionUpdaters));
  }

  // Subgroups (used for Advanced).
  for (const sg of section.subgroups) {
    wrap.appendChild(renderSubgroup(sg, opts, updaters, optionUpdaters));
  }

  return wrap;
}

function renderSubgroup(
  sg: PanelSubgroup,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
  optionUpdaters: Map<string, (options: Array<{ value: string | number; label: string }>) => void>,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "syn-panel-subgroup";
  wrap.dataset.subgroupId = sg.id;

  const header = document.createElement("h4");
  header.className = "syn-panel-subgroup-title";
  header.textContent = sg.title;
  wrap.appendChild(header);

  for (const w of sg.widgets) {
    wrap.appendChild(renderWidget(w, opts, updaters, optionUpdaters));
  }
  return wrap;
}

function renderWidget(
  w: WidgetDescriptor,
  opts: RenderPanelOptions,
  updaters: Map<string, (v: PanelDispatchValue) => void>,
  optionUpdaters: Map<string, (options: Array<{ value: string | number; label: string }>) => void>,
): HTMLElement {
  switch (w.kind) {
    case "slider":
      return renderSlider(w, opts, updaters);
    case "select":
      return renderSelect(w, opts, updaters, optionUpdaters);
    case "toggle":
      return renderToggle(w, opts, updaters);
    case "number":
      return renderNumber(w, opts, updaters);
    case "pair":
      return renderPair(w, opts, updaters, optionUpdaters);
    default:
      throw new Error(
        `unknown widget kind: ${(w as { kind: string }).kind}`,
      );
  }
}

function widgetShell(w: WidgetDescriptor): HTMLElement {
  const el = document.createElement("div");
  el.className = `syn-panel-widget syn-panel-widget-${w.kind}`;
  el.dataset.widgetId = w.id;

  const labelWrap = document.createElement("div");
  labelWrap.className = "syn-panel-widget-label-wrap";

  const label = document.createElement("label");
  label.className = "syn-panel-widget-label";
  label.textContent = w.label;
  label.htmlFor = domId(w.id);
  labelWrap.appendChild(label);

  // Descriptor prose (tooltip + directionality endpoints for sliders)
  // lives in a hover-only panel behind a `?` icon rather than crowding
  // the widget row inline. Same font weight / colour as the rest of
  // the panel body — this is real content, not a browser tooltip.
  const helpBody = buildHelpBody(w);
  if (helpBody) {
    const help = document.createElement("span");
    help.className = "syn-panel-widget-help";
    help.textContent = "?";
    help.setAttribute("aria-label", "Show description");
    help.tabIndex = 0;
    const panel = document.createElement("div");
    panel.className = "syn-panel-widget-help-panel";
    panel.appendChild(helpBody);
    // The panel is fixed-position so it escapes ancestor overflow
    // (frame body scrolls; label-wrap ellipsises). Placement is
    // computed on hover / focus relative to the '?' icon.
    document.body.appendChild(panel);
    const place = () => {
      const r = help.getBoundingClientRect();
      panel.style.left = `${Math.round(r.right + 6)}px`;
      panel.style.top = `${Math.round(r.top - 4)}px`;
      panel.classList.add("open");
    };
    const hide = () => panel.classList.remove("open");
    help.addEventListener("mouseenter", place);
    help.addEventListener("focus", place);
    help.addEventListener("mouseleave", hide);
    help.addEventListener("blur", hide);
    labelWrap.appendChild(help);
  }

  el.appendChild(labelWrap);
  return el;
}

/**
 * Build the DOM body for the hover-help panel. Combines the widget's
 * primary tooltip (from annotation `notes[0]`) with slider endpoint
 * hints (from directionality). Returns null when the widget has
 * nothing to say — the `?` icon is omitted in that case.
 */
function buildHelpBody(w: WidgetDescriptor): HTMLElement | null {
  const hasTooltip = Boolean(w.tooltip);
  const hasEndpoints =
    w.kind === "slider" && Boolean((w as SliderWidgetDescriptor).low || (w as SliderWidgetDescriptor).high);
  if (!hasTooltip && !hasEndpoints) return null;

  const body = document.createElement("div");
  body.className = "syn-panel-widget-help-body";

  if (hasTooltip) {
    const p = document.createElement("p");
    p.className = "syn-panel-widget-help-tooltip";
    p.textContent = w.tooltip!;
    body.appendChild(p);
  }
  if (hasEndpoints) {
    const s = w as SliderWidgetDescriptor;
    const list = document.createElement("dl");
    list.className = "syn-panel-widget-help-endpoints";
    if (s.low) {
      const dt = document.createElement("dt");
      dt.textContent = "Low";
      const dd = document.createElement("dd");
      dd.textContent = s.low;
      list.appendChild(dt);
      list.appendChild(dd);
    }
    if (s.high) {
      const dt = document.createElement("dt");
      dt.textContent = "High";
      const dd = document.createElement("dd");
      dd.textContent = s.high;
      list.appendChild(dt);
      list.appendChild(dd);
    }
    body.appendChild(list);
  }
  return body;
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
  // Endpoint hints live in the hover-help panel (widgetShell) rather
  // than as an inline line — kept off the primary widget row to keep
  // the panel legible.

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
  optionUpdaters: Map<string, (options: Array<{ value: string | number; label: string }>) => void>,
): HTMLElement {
  const el = widgetShell(w);
  const select = document.createElement("select");
  select.id = domId(w.id);

  // Options come from the descriptor by default; dynamicOptions widgets
  // (e.g. input:source) ask the renderer's optionsFor() hook for
  // runtime-populated lists at bind time and may be refreshed later
  // via RenderedPanel.updateOptions().
  let currentOptions: Array<{ value: string | number; label: string }> =
    w.dynamicOptions ? (opts.optionsFor?.(w.id) ?? []) : w.options;

  const rebuild = () => {
    select.innerHTML = "";
    if (w.clearable) {
      const clear = document.createElement("option");
      clear.value = "";
      clear.textContent = "—";
      select.appendChild(clear);
    }
    if (w.dynamicOptions && currentOptions.length === 0) {
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "(none available)";
      empty.disabled = true;
      select.appendChild(empty);
      select.disabled = true;
    } else {
      select.disabled = false;
    }
    for (const opt of currentOptions) {
      const option = document.createElement("option");
      option.value = String(opt.value);
      option.textContent = opt.label;
      select.appendChild(option);
    }
  };
  rebuild();

  const initial = initialFor(opts, w.id, w.defaultValue);
  select.value = initial === null ? "" : String(initial);

  select.addEventListener("change", () => {
    if (w.clearable && select.value === "") {
      opts.dispatch(w.id, null);
    } else {
      const opt = currentOptions.find((o) => String(o.value) === select.value);
      opts.dispatch(w.id, opt ? opt.value : select.value);
    }
  });

  el.appendChild(select);
  // Clearable selects also get an explicit Clear button so pair widgets
  // (key, meter) can wire both children's clears to one shared handler.
  // The inline "—" option stays as a convenience affordance.
  if (w.clearable) {
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "syn-panel-widget-clear";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => {
      select.value = "";
      opts.dispatch(w.id, null);
    });
    const trail = document.createElement("div");
    trail.className = "syn-panel-widget-trail";
    trail.appendChild(clearBtn);
    el.appendChild(trail);
  }

  updaters.set(w.id, (v) => {
    select.value = v === null || v === undefined ? "" : String(v);
  });
  if (w.dynamicOptions) {
    optionUpdaters.set(w.id, (nextOptions) => {
      const prevValue = select.value;
      currentOptions = nextOptions;
      rebuild();
      // Preserve the current selection if the new option list still
      // includes it — user shouldn't be silently reset on refresh.
      if (nextOptions.some((o) => String(o.value) === prevValue)) {
        select.value = prevValue;
      }
    });
  }

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
  // unit + clear share one grid cell so 'BPM' and 'Clear' sit on the
  // same row as the input — the earlier layout put them in separate
  // columns and Clear wrapped to a new line.
  if (w.unit || w.clearable) {
    const trail = document.createElement("div");
    trail.className = "syn-panel-widget-trail";
    if (w.unit) {
      const unit = document.createElement("span");
      unit.className = "syn-panel-widget-unit";
      unit.textContent = w.unit;
      trail.appendChild(unit);
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
      trail.appendChild(clearBtn);
    }
    el.appendChild(trail);
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
  optionUpdaters: Map<string, (options: Array<{ value: string | number; label: string }>) => void>,
): HTMLElement {
  // Use widgetShell so the pair gets its own '?' hover-help driven by
  // its tooltip / notes. Then override the grid to stack the children
  // below the group label rather than sitting in one grid row.
  const el = widgetShell(w);
  const row = document.createElement("div");
  row.className = "syn-panel-widget-pair-children";
  for (const child of w.children) {
    row.appendChild(renderWidget(child, opts, updaters, optionUpdaters));
  }
  el.appendChild(row);

  // For a nullable pair (session:key, session:meter), each child's
  // Clear button should clear BOTH children — the pair is meaningful
  // only as a set. Rebind after render.
  if (w.nullable) {
    const clearAll = () => {
      for (const child of w.children) {
        const scope = row.querySelector(
          `[data-widget-id="${cssEscape(child.id)}"]`,
        );
        const inputEl = scope?.querySelector("select, input") as
          | HTMLSelectElement
          | HTMLInputElement
          | null;
        if (inputEl) inputEl.value = "";
        opts.dispatch(child.id, null);
      }
    };
    for (const btn of row.querySelectorAll<HTMLButtonElement>(
      ".syn-panel-widget-clear",
    )) {
      const fresh = btn.cloneNode(true) as HTMLButtonElement;
      fresh.addEventListener("click", clearAll);
      btn.replaceWith(fresh);
    }
  }
  return el;
}

function cssEscape(s: string): string {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(s)
    : s.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
