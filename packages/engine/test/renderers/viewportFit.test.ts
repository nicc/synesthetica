import { describe, it, expect } from "vitest";
import { visibleWorldExtent, worldToViewportFraction } from "../../src/renderers/viewportFit";

describe("viewport fit (contain)", () => {
  it("shows the full height on wide viewports, extra width as margin", () => {
    expect(visibleWorldExtent(16 / 9)).toEqual({ width: 75 * (16 / 9), height: 75 });
  });

  it("shows the full width on narrow viewports, extra height as bands", () => {
    const e = visibleWorldExtent(1);
    expect(e.width).toBeCloseTo(100);
    expect(e.height).toBeCloseTo(100);
  });

  it("never crops: the world's corners stay within the viewport", () => {
    for (const aspect of [0.5, 0.75, 1, 4 / 3, 2]) {
      const bl = worldToViewportFraction(0, 0, aspect);
      const tr = worldToViewportFraction(100, 75, aspect);
      expect(bl.fromLeft).toBeGreaterThanOrEqual(-1e-9);
      expect(bl.fromBottom).toBeGreaterThanOrEqual(-1e-9);
      expect(tr.fromLeft).toBeLessThanOrEqual(1 + 1e-9);
      expect(tr.fromBottom).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("matches the old height-fit maths at 4:3 and wider", () => {
    const aspect = 16 / 9;
    expect(worldToViewportFraction(79, 0, aspect).fromLeft).toBeCloseTo(29 / (75 * aspect) + 0.5);
    expect(worldToViewportFraction(0, 11.25, aspect).fromBottom).toBeCloseTo(0.15);
  });
});
