// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { buildAboutPanel, isNarrowScreen, NARROW_SCREEN_QUERY } from "../src/panel/aboutPanel.js";

describe("About panel mobile warning", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("puts the warning strip first in the panel", async () => {
    const panel = await buildAboutPanel();
    const first = panel.firstElementChild as HTMLElement;
    expect(first.className).toBe("syn-about-mobile-warning");
    expect(first.textContent).toBe("This app is not built for mobile, please view on desktop.");
  });

  it("detects narrow screens with the shared media query", () => {
    const matchMedia = vi.fn((q: string) => ({ matches: q === NARROW_SCREEN_QUERY }));
    vi.stubGlobal("matchMedia", matchMedia);
    expect(isNarrowScreen()).toBe(true);
    expect(matchMedia).toHaveBeenCalledWith(NARROW_SCREEN_QUERY);
  });

  it("treats a missing matchMedia as not narrow", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(isNarrowScreen()).toBe(false);
  });
});
