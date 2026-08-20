/**
 * Panel shell — the three-button toolbar (Basics / Advanced / About)
 * and the panel-visibility state machine.
 *
 * Semantics per SPEC 013 §UI Controls (extended by design conversation):
 *   - At most one panel is open at a time.
 *   - Clicking a button opens its panel; clicking the same button (or
 *     the close X, or outside the panel) closes it.
 *   - Clicking a different button while one is open swaps them.
 *   - Panels float centred over the visualisation.
 *
 * The shell owns the container elements and the visibility state.
 * Callers provide the content for each panel (an HTMLElement).
 */

export type PanelId = "basics" | "advanced" | "about";

export interface PanelShellOptions {
  /** Host element the shell mounts into (typically <body>). */
  host: HTMLElement;
  /** Panel content providers, keyed by panel id. Lazily called on first open. */
  panelContent: Record<PanelId, () => HTMLElement | Promise<HTMLElement>>;
  /** Optional button labels; defaults are the panel ids capitalised. */
  labels?: Partial<Record<PanelId, string>>;
}

export interface PanelShellHandle {
  open(id: PanelId): void;
  close(): void;
  /** Currently-open panel id, or null when nothing is open. */
  current(): PanelId | null;
}

const PANEL_ORDER: PanelId[] = ["basics", "advanced", "about"];

export function mountPanelShell(opts: PanelShellOptions): PanelShellHandle {
  // The toolbar — three buttons top-right.
  const toolbar = document.createElement("div");
  toolbar.className = "syn-panel-toolbar";

  // The panel host — becomes visible when a panel is open.
  const overlay = document.createElement("div");
  overlay.className = "syn-panel-overlay";
  overlay.hidden = true;

  const panelHost = document.createElement("div");
  panelHost.className = "syn-panel-host";
  overlay.appendChild(panelHost);

  // Cache built content so re-opening the same panel doesn't rebuild.
  const cache = new Map<PanelId, HTMLElement>();

  let openId: PanelId | null = null;
  const buttons = new Map<PanelId, HTMLButtonElement>();

  const setOpen = (id: PanelId | null) => {
    openId = id;
    for (const [pid, btn] of buttons) {
      btn.classList.toggle("open", pid === id);
      btn.setAttribute("aria-pressed", pid === id ? "true" : "false");
    }
    overlay.hidden = id === null;
  };

  const openPanel = (id: PanelId) => {
    let content = cache.get(id);
    if (!content) {
      const built = opts.panelContent[id]();
      if (built instanceof HTMLElement) {
        // Sync builder — cache immediately.
        cache.set(id, built);
        content = built;
      } else {
        // Async builder — show placeholder, swap in on resolve.
        const placeholder = document.createElement("div");
        placeholder.className = "syn-panel-placeholder";
        placeholder.textContent = "Loading…";
        cache.set(id, placeholder);
        content = placeholder;
        built.then((resolved) => {
          cache.set(id, resolved);
          if (openId === id) {
            panelHost.innerHTML = "";
            panelHost.appendChild(
              wrapWithHeader(id, opts.labels?.[id] ?? cap(id), resolved, close),
            );
          }
        });
      }
    }
    panelHost.innerHTML = "";
    panelHost.appendChild(
      wrapWithHeader(id, opts.labels?.[id] ?? cap(id), content, close),
    );
    setOpen(id);
  };

  const close = () => {
    setOpen(null);
  };

  const toggle = (id: PanelId) => {
    if (openId === id) close();
    else openPanel(id);
  };

  for (const id of PANEL_ORDER) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `syn-panel-tab syn-panel-tab-${id}`;
    btn.dataset.panelId = id;
    btn.textContent = opts.labels?.[id] ?? cap(id);
    btn.setAttribute("aria-pressed", "false");
    btn.addEventListener("click", () => toggle(id));
    buttons.set(id, btn);
    toolbar.appendChild(btn);
  }

  // Click-outside-to-close: fires when the overlay backdrop (not the
  // panel host itself) is clicked.
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  // ESC also closes.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && openId !== null) close();
  });

  opts.host.appendChild(toolbar);
  opts.host.appendChild(overlay);

  return {
    open: openPanel,
    close,
    current: () => openId,
  };
}

function wrapWithHeader(
  id: PanelId,
  title: string,
  body: HTMLElement,
  onClose: () => void,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `syn-panel-frame syn-panel-frame-${id}`;
  wrap.dataset.panelId = id;

  const header = document.createElement("div");
  header.className = "syn-panel-frame-header";
  const h = document.createElement("div");
  h.className = "syn-panel-frame-title";
  h.textContent = title;
  header.appendChild(h);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "syn-panel-frame-close";
  closeBtn.setAttribute("aria-label", "Close panel");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", onClose);
  header.appendChild(closeBtn);
  wrap.appendChild(header);

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "syn-panel-frame-body";
  bodyWrap.appendChild(body);
  wrap.appendChild(bodyWrap);

  return wrap;
}

function cap(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}
