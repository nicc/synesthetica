// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { mountPanelShell, type PanelShellHandle } from "../src/panel/panelShell.js";

function makeContent(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "test-content";
  el.textContent = text;
  return el;
}

let handle: PanelShellHandle;
beforeEach(() => {
  document.body.innerHTML = "";
  handle = mountPanelShell({
    host: document.body,
    panelContent: {
      basics: () => makeContent("basics-body"),
      advanced: () => makeContent("advanced-body"),
      about: () => makeContent("about-body"),
    },
  });
});

describe("PanelShell — toolbar + visibility state machine", () => {
  it("renders three toolbar buttons in fixed order", () => {
    const buttons = Array.from(document.querySelectorAll(".syn-panel-tab"));
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("data-panel-id")).toBe("basics");
    expect(buttons[1].getAttribute("data-panel-id")).toBe("advanced");
    expect(buttons[2].getAttribute("data-panel-id")).toBe("about");
  });

  it("overlay is hidden until a panel opens", () => {
    const overlay = document.querySelector(".syn-panel-overlay") as HTMLElement;
    expect(overlay.hidden).toBe(true);
  });

  it("clicking a tab opens its panel", () => {
    (document.querySelector('[data-panel-id="basics"]') as HTMLButtonElement).click();
    expect(handle.current()).toBe("basics");
    const overlay = document.querySelector(".syn-panel-overlay") as HTMLElement;
    expect(overlay.hidden).toBe(false);
    expect(overlay.textContent).toContain("basics-body");
  });

  it("clicking the same tab twice closes the panel", () => {
    const btn = document.querySelector('[data-panel-id="basics"]') as HTMLButtonElement;
    btn.click();
    btn.click();
    expect(handle.current()).toBeNull();
    expect((document.querySelector(".syn-panel-overlay") as HTMLElement).hidden).toBe(true);
  });

  it("switching tabs swaps panels (never both open)", () => {
    (document.querySelector('[data-panel-id="basics"]') as HTMLButtonElement).click();
    expect(handle.current()).toBe("basics");
    (document.querySelector('[data-panel-id="advanced"]') as HTMLButtonElement).click();
    expect(handle.current()).toBe("advanced");
    const overlay = document.querySelector(".syn-panel-overlay") as HTMLElement;
    expect(overlay.textContent).toContain("advanced-body");
    expect(overlay.textContent).not.toContain("basics-body");
  });

  it("close button closes the panel", () => {
    (document.querySelector('[data-panel-id="advanced"]') as HTMLButtonElement).click();
    (document.querySelector(".syn-panel-frame-close") as HTMLButtonElement).click();
    expect(handle.current()).toBeNull();
  });

  it("clicking the overlay backdrop closes the panel", () => {
    (document.querySelector('[data-panel-id="basics"]') as HTMLButtonElement).click();
    const overlay = document.querySelector(".syn-panel-overlay") as HTMLElement;
    overlay.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Simulated click on overlay itself (e.target === overlay).
    expect(handle.current()).toBeNull();
  });

  it("clicking inside the panel body does NOT close it", () => {
    (document.querySelector('[data-panel-id="basics"]') as HTMLButtonElement).click();
    const body = document.querySelector(".syn-panel-frame-body") as HTMLElement;
    body.click();
    expect(handle.current()).toBe("basics");
  });

  it("ESC closes an open panel", () => {
    (document.querySelector('[data-panel-id="basics"]') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(handle.current()).toBeNull();
  });

  it("open tab gets an 'open' class + aria-pressed=true", () => {
    const basicsBtn = document.querySelector(
      '[data-panel-id="basics"]',
    ) as HTMLButtonElement;
    basicsBtn.click();
    expect(basicsBtn.classList.contains("open")).toBe(true);
    expect(basicsBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("handle.open(id) and handle.close() work programmatically", () => {
    handle.open("about");
    expect(handle.current()).toBe("about");
    handle.close();
    expect(handle.current()).toBeNull();
  });
});
