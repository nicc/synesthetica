/**
 * Tests for renderChordShape utility
 */

import { describe, it, expect } from "vitest";
import {
  renderChordShape,
  colorToCSS,
  getDashArray,
  HUB_RADIUS,
  ARM_LENGTH,
  BASE_WIDTH,
} from "../../src/vocabularies/renderChordShape";
import type { ChordShapeGeometry, ChordShapeElement } from "@synesthetica/contracts";

// Helper to create a test element
function makeElement(
  angle: number,
  tier: ChordShapeElement["tier"],
  interval: string,
  style: "wedge" | "line" = "wedge"
): ChordShapeElement {
  return {
    angle,
    radius: tier === "triadic" ? 1.0 : tier === "seventh" ? 0.618 : 0.382,
    tier,
    style,
    interval,
    color: { h: angle, s: 0.8, v: 0.7, a: 1 },
  };
}

describe("renderChordShape", () => {
  describe("constants", () => {
    it("exports expected constants", () => {
      expect(HUB_RADIUS).toBe(0.3);
      expect(ARM_LENGTH.triadic).toBe(0.7);
      expect(ARM_LENGTH.seventh).toBe(0.45);
      expect(ARM_LENGTH.extension).toBe(0.25);
      expect(BASE_WIDTH).toBe(30);
    });
  });

  describe("basic rendering", () => {
    it("renders a major triad shape", () => {
      const geometry: ChordShapeGeometry = {
        elements: [
          makeElement(0, "triadic", "1"),
          makeElement(120, "triadic", "3"),
          makeElement(210, "triadic", "5"),
        ],
        margin: "straight",
        rootAngle: 0,
      };

      const result = renderChordShape(geometry, {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      // Should have a fill path
      expect(result.fillPath).toBeTruthy();
      expect(result.fillPath).toContain("M");
      expect(result.fillPath).toContain("L");
      expect(result.fillPath).toContain("Z");

      // Should have 3 elements
      expect(result.elements).toHaveLength(3);
      expect(result.elements.map((e) => e.interval)).toEqual(["1", "3", "5"]);

      // No lines for basic triad
      expect(result.linePaths).toHaveLength(0);

      // Hub radius should be calculated
      expect(result.hubRadius).toBe(100 * HUB_RADIUS);
    });

    it("renders chromatic lines separately", () => {
      const geometry: ChordShapeGeometry = {
        elements: [
          makeElement(0, "triadic", "1"),
          makeElement(120, "triadic", "3"),
          makeElement(210, "triadic", "5"),
          makeElement(300, "seventh", "♭7"),
          makeElement(90, "extension", "♯9", "line"), // Chromatic
        ],
        margin: "straight",
        rootAngle: 0,
      };

      const result = renderChordShape(geometry, {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      // Should have 4 wedge elements (not including line)
      expect(result.elements).toHaveLength(4);

      // Should have 1 line path
      expect(result.linePaths).toHaveLength(1);
      expect(result.linePaths[0].path).toContain("M");
      expect(result.linePaths[0].path).toContain("L");
    });

    it("returns margin style for stroke styling", () => {
      const geometry: ChordShapeGeometry = {
        elements: [makeElement(0, "triadic", "1")],
        margin: "wavy",
        rootAngle: 0,
      };

      const result = renderChordShape(geometry, {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      expect(result.margin).toBe("wavy");
    });
  });

  describe("per-element data", () => {
    it("provides per-element paths with colors", () => {
      const geometry: ChordShapeGeometry = {
        elements: [
          { ...makeElement(0, "triadic", "1"), color: { h: 0, s: 0.8, v: 0.7, a: 1 } },
          { ...makeElement(120, "triadic", "3"), color: { h: 120, s: 0.8, v: 0.7, a: 1 } },
        ],
        margin: "straight",
        rootAngle: 0,
      };

      const result = renderChordShape(geometry, {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      expect(result.elements[0].color.h).toBe(0);
      expect(result.elements[1].color.h).toBe(120);
      expect(result.elements[0].interval).toBe("1");
      expect(result.elements[1].interval).toBe("3");
    });

    it("provides tier information for each element", () => {
      const geometry: ChordShapeGeometry = {
        elements: [
          makeElement(0, "triadic", "1"),
          makeElement(300, "seventh", "♭7"),
          makeElement(60, "extension", "9"),
        ],
        margin: "straight",
        rootAngle: 0,
      };

      const result = renderChordShape(geometry, {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      const tiers = result.elements.map((e) => e.tier);
      expect(tiers).toContain("triadic");
      expect(tiers).toContain("seventh");
      expect(tiers).toContain("extension");
    });
  });

  describe("scaling", () => {
    it("scales path coordinates based on scale option", () => {
      const geometry: ChordShapeGeometry = {
        elements: [makeElement(0, "triadic", "1")],
        margin: "straight",
        rootAngle: 0,
      };

      const small = renderChordShape(geometry, {
        scale: 50,
        center: { x: 50, y: 50 },
      });

      const large = renderChordShape(geometry, {
        scale: 200,
        center: { x: 200, y: 200 },
      });

      expect(small.hubRadius).toBe(50 * HUB_RADIUS);
      expect(large.hubRadius).toBe(200 * HUB_RADIUS);
    });
  });

  describe("empty geometry", () => {
    it("handles empty elements array", () => {
      const geometry: ChordShapeGeometry = {
        elements: [],
        margin: "straight",
        rootAngle: 0,
      };

      const result = renderChordShape(geometry, {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      expect(result.fillPath).toBe("");
      expect(result.elements).toHaveLength(0);
      expect(result.linePaths).toHaveLength(0);
    });
  });
});

describe("colorToCSS", () => {
  it("converts HSV to RGB", () => {
    // Red (H=0)
    const red = colorToCSS({ h: 0, s: 1, v: 1, a: 1 });
    expect(red).toBe("rgb(255, 0, 0)");

    // Green (H=120)
    const green = colorToCSS({ h: 120, s: 1, v: 1, a: 1 });
    expect(green).toBe("rgb(0, 255, 0)");

    // Blue (H=240)
    const blue = colorToCSS({ h: 240, s: 1, v: 1, a: 1 });
    expect(blue).toBe("rgb(0, 0, 255)");
  });

  it("handles saturation and value", () => {
    // White (S=0, V=1)
    const white = colorToCSS({ h: 0, s: 0, v: 1, a: 1 });
    expect(white).toBe("rgb(255, 255, 255)");

    // Black (V=0)
    const black = colorToCSS({ h: 0, s: 1, v: 0, a: 1 });
    expect(black).toBe("rgb(0, 0, 0)");

    // Gray (S=0, V=0.5)
    const gray = colorToCSS({ h: 0, s: 0, v: 0.5, a: 1 });
    expect(gray).toBe("rgb(128, 128, 128)");
  });

  it("includes alpha when less than 1", () => {
    const semiTransparent = colorToCSS({ h: 0, s: 1, v: 1, a: 0.5 });
    expect(semiTransparent).toBe("rgba(255, 0, 0, 0.50)");
  });

  it("omits alpha when equal to 1", () => {
    const opaque = colorToCSS({ h: 0, s: 1, v: 1, a: 1 });
    expect(opaque).toBe("rgb(255, 0, 0)");
  });
});

describe("getDashArray", () => {
  it("returns dash array for dashed styles", () => {
    expect(getDashArray("dash-short")).toBe("3,3");
    expect(getDashArray("dash-long")).toBe("6,3");
  });

  it("returns undefined for non-dashed styles", () => {
    expect(getDashArray("straight")).toBeUndefined();
    expect(getDashArray("wavy")).toBeUndefined();
    expect(getDashArray("concave")).toBeUndefined();
    expect(getDashArray("convex")).toBeUndefined();
  });
});
