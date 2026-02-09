/**
 * Tests for ChordShapeBuilder utility
 *
 * ChordShapeBuilder is the single source of truth for chord shape geometry.
 * It computes geometry once and outputs to SVG (for snapshots) and Three.js (for WebGL).
 */

import { describe, it, expect } from "vitest";
import {
  ChordShapeBuilder,
  colorToCSS,
  getDashArray,
  getThreeDashParams,
  HUB_RADIUS,
  ARM_LENGTH,
  BASE_WIDTH,
} from "../../src/utils/ChordShapeBuilder";
import type { ChordShapeElement, MarginStyle } from "@synesthetica/contracts";

// ============================================================================
// Test Helpers
// ============================================================================

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

function createMajorTriad(): ChordShapeElement[] {
  return [
    makeElement(0, "triadic", "1"),
    makeElement(120, "triadic", "3"),
    makeElement(210, "triadic", "5"),
  ];
}

function createDom7(): ChordShapeElement[] {
  return [
    makeElement(0, "triadic", "1"),
    makeElement(120, "triadic", "3"),
    makeElement(210, "triadic", "5"),
    makeElement(300, "seventh", "♭7"),
  ];
}

// ============================================================================
// Constants Tests
// ============================================================================

describe("ChordShapeBuilder constants", () => {
  it("exports expected constants", () => {
    expect(HUB_RADIUS).toBe(0.3);
    expect(ARM_LENGTH.triadic).toBe(0.7);
    expect(ARM_LENGTH.seventh).toBe(0.45);
    expect(ARM_LENGTH.extension).toBe(0.25);
    expect(BASE_WIDTH).toBe(30);
  });
});

// ============================================================================
// SVG Output Tests
// ============================================================================

describe("ChordShapeBuilder SVG output", () => {
  describe("toSVGPath", () => {
    it("generates valid SVG path for major triad", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "straight", {
        scale: 100,
        center: { x: 200, y: 200 },
      });

      const path = builder.toSVGPath();

      expect(path).toContain("M"); // moveTo
      expect(path).toContain("L"); // lineTo
      expect(path).toContain("Z"); // closePath
      expect(path).toContain("A"); // arc (for straight margin hub)
    });

    it("returns empty string for empty elements", () => {
      const builder = new ChordShapeBuilder([], "straight", {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      expect(builder.toSVGPath()).toBe("");
    });

    it("uses cubic bezier for concave margin", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "concave", {
        scale: 100,
        center: { x: 200, y: 200 },
      });

      const path = builder.toSVGPath();

      // Concave uses cubic bezier (C command)
      expect(path).toContain("C");
    });

    it("uses quadratic curves for wavy margin", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "wavy", {
        scale: 100,
        center: { x: 200, y: 200 },
      });

      const path = builder.toSVGPath();

      // Wavy uses quadratic bezier (Q command)
      expect(path).toContain("Q");
    });

    it("uses arc for convex margin", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "convex", {
        scale: 100,
        center: { x: 200, y: 200 },
      });

      const path = builder.toSVGPath();

      // Convex uses arc (A command)
      expect(path).toContain("A");
    });
  });

  describe("toSVGLines", () => {
    it("returns empty array when no line elements", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "straight", {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      expect(builder.toSVGLines()).toHaveLength(0);
    });

    it("generates paths for chromatic line elements", () => {
      const elements = [
        ...createMajorTriad(),
        makeElement(90, "extension", "♯9", "line"),
        makeElement(270, "extension", "♭13", "line"),
      ];

      const builder = new ChordShapeBuilder(elements, "straight", {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      const lines = builder.toSVGLines();

      expect(lines).toHaveLength(2);
      expect(lines[0].path).toContain("M");
      expect(lines[0].path).toContain("L");
      expect(lines[0].color.h).toBe(90);
      expect(lines[1].color.h).toBe(270);
    });
  });
});

// ============================================================================
// Three.js Output Tests
// ============================================================================

describe("ChordShapeBuilder Three.js output", () => {
  describe("toThreeShape", () => {
    it("generates a THREE.Shape for major triad", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "straight", {
        scale: 10, // Typical local unit size
        center: { x: 0, y: 0 },
      });

      const shape = builder.toThreeShape();

      // Shape should have curves in its path
      expect(shape.curves.length).toBeGreaterThan(0);
    });

    it("returns empty shape for empty elements", () => {
      const builder = new ChordShapeBuilder([], "straight", {
        scale: 10,
        center: { x: 0, y: 0 },
      });

      const shape = builder.toThreeShape();

      expect(shape.curves.length).toBe(0);
    });

    it("centers shape at origin when center is (0,0)", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "straight", {
        scale: 10,
        center: { x: 0, y: 0 },
      });

      const shape = builder.toThreeShape();
      const points = shape.getPoints(10);

      // Verify points are distributed around origin
      const avgX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const avgY = points.reduce((sum, p) => sum + p.y, 0) / points.length;

      // Average should be close to origin (within some tolerance)
      expect(Math.abs(avgX)).toBeLessThan(2);
      expect(Math.abs(avgY)).toBeLessThan(2);
    });

    it("uses bezier curves for concave margin", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "concave", {
        scale: 10,
        center: { x: 0, y: 0 },
      });

      const shape = builder.toThreeShape();

      // Should have CubicBezierCurve instances for smooth concave arcs
      const hasCubicBezier = shape.curves.some(
        (curve) => curve.type === "CubicBezierCurve"
      );
      expect(hasCubicBezier).toBe(true);
    });

    it("uses quadratic curves for wavy margin", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "wavy", {
        scale: 10,
        center: { x: 0, y: 0 },
      });

      const shape = builder.toThreeShape();

      // Should have QuadraticBezierCurve instances for wavy arcs
      const hasQuadratic = shape.curves.some(
        (curve) => curve.type === "QuadraticBezierCurve"
      );
      expect(hasQuadratic).toBe(true);
    });
  });

  describe("toThreeLines", () => {
    it("returns empty array when no line elements", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "straight", {
        scale: 10,
        center: { x: 0, y: 0 },
      });

      expect(builder.toThreeLines()).toHaveLength(0);
    });

    it("generates buffer geometries for line elements", () => {
      const elements = [
        ...createMajorTriad(),
        makeElement(90, "extension", "♯9", "line"),
      ];

      const builder = new ChordShapeBuilder(elements, "straight", {
        scale: 10,
        center: { x: 0, y: 0 },
      });

      const lines = builder.toThreeLines();

      expect(lines).toHaveLength(1);
      expect(lines[0].geometry).toBeDefined();
      expect(lines[0].geometry.attributes.position).toBeDefined();
      expect(lines[0].color.h).toBe(90);
    });
  });
});

// ============================================================================
// Accessor Tests
// ============================================================================

describe("ChordShapeBuilder accessors", () => {
  describe("getHub", () => {
    it("returns hub center and radius", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "straight", {
        scale: 100,
        center: { x: 200, y: 150 },
      });

      const hub = builder.getHub();

      expect(hub.center.x).toBe(200);
      expect(hub.center.y).toBe(150);
      expect(hub.radius).toBe(100 * HUB_RADIUS);
    });
  });

  describe("getArms", () => {
    it("returns arm geometry for wedge elements", () => {
      const builder = new ChordShapeBuilder(createDom7(), "straight", {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      const arms = builder.getArms();

      expect(arms).toHaveLength(4);

      // Verify intervals are preserved
      const intervals = arms.map((a) => a.interval);
      expect(intervals).toContain("1");
      expect(intervals).toContain("3");
      expect(intervals).toContain("5");
      expect(intervals).toContain("♭7");
    });

    it("excludes line elements from arms", () => {
      const elements = [
        ...createMajorTriad(),
        makeElement(90, "extension", "♯9", "line"),
      ];

      const builder = new ChordShapeBuilder(elements, "straight", {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      const arms = builder.getArms();

      expect(arms).toHaveLength(3); // Only wedges, not lines
    });

    it("sorts arms by angle", () => {
      // Create elements out of order
      const elements = [
        makeElement(210, "triadic", "5"),
        makeElement(0, "triadic", "1"),
        makeElement(120, "triadic", "3"),
      ];

      const builder = new ChordShapeBuilder(elements, "straight", {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      const arms = builder.getArms();

      // Should be sorted by angle
      expect(arms[0].angle).toBe(0);
      expect(arms[1].angle).toBe(120);
      expect(arms[2].angle).toBe(210);
    });
  });

  describe("getMargin", () => {
    it("returns the margin style", () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), "wavy", {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      expect(builder.getMargin()).toBe("wavy");
    });
  });
});

// ============================================================================
// Coordinate System Tests
// ============================================================================

describe("ChordShapeBuilder coordinate systems", () => {
  it("SVG uses Y-down (cy - radius*sin)", () => {
    // Test that SVG coordinates have Y increasing downward
    const builder = new ChordShapeBuilder(
      [makeElement(0, "triadic", "1")], // 0° = 12 o'clock = top
      "straight",
      {
        scale: 100,
        center: { x: 0, y: 0 },
      }
    );

    const arms = builder.getArms();
    const tip = arms[0].tip;

    // At 0° (12 o'clock), tip should be above center (negative Y in SVG)
    expect(tip.y).toBeLessThan(0);
  });

  it("Three.js uses Y-up (positive Y for top)", () => {
    const builder = new ChordShapeBuilder(
      [makeElement(0, "triadic", "1")], // 0° = 12 o'clock = top
      "straight",
      {
        scale: 10,
        center: { x: 0, y: 0 },
      }
    );

    const shape = builder.toThreeShape();
    const points = shape.getPoints(10);

    // Find the topmost point (should have positive Y)
    const maxY = Math.max(...points.map((p) => p.y));
    expect(maxY).toBeGreaterThan(0);
  });
});

// ============================================================================
// Margin Style Tests
// ============================================================================

describe("ChordShapeBuilder margin styles", () => {
  const marginStyles: MarginStyle[] = [
    "straight",
    "wavy",
    "concave",
    "convex",
    "dash-short",
    "dash-long",
  ];

  marginStyles.forEach((margin) => {
    it(`handles ${margin} margin without error`, () => {
      const builder = new ChordShapeBuilder(createMajorTriad(), margin, {
        scale: 100,
        center: { x: 100, y: 100 },
      });

      // Should not throw
      expect(() => builder.toSVGPath()).not.toThrow();
      expect(() => builder.toThreeShape()).not.toThrow();
    });
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe("colorToCSS", () => {
  it("converts HSV to RGB", () => {
    // Red (H=0)
    expect(colorToCSS({ h: 0, s: 1, v: 1, a: 1 })).toBe("rgb(255, 0, 0)");

    // Green (H=120)
    expect(colorToCSS({ h: 120, s: 1, v: 1, a: 1 })).toBe("rgb(0, 255, 0)");

    // Blue (H=240)
    expect(colorToCSS({ h: 240, s: 1, v: 1, a: 1 })).toBe("rgb(0, 0, 255)");
  });

  it("handles saturation and value", () => {
    // White (S=0, V=1)
    expect(colorToCSS({ h: 0, s: 0, v: 1, a: 1 })).toBe("rgb(255, 255, 255)");

    // Black (V=0)
    expect(colorToCSS({ h: 0, s: 1, v: 0, a: 1 })).toBe("rgb(0, 0, 0)");

    // Gray (S=0, V=0.5)
    expect(colorToCSS({ h: 0, s: 0, v: 0.5, a: 1 })).toBe("rgb(128, 128, 128)");
  });

  it("includes alpha when less than 1", () => {
    expect(colorToCSS({ h: 0, s: 1, v: 1, a: 0.5 })).toBe("rgba(255, 0, 0, 0.50)");
  });

  it("omits alpha when equal to 1", () => {
    expect(colorToCSS({ h: 0, s: 1, v: 1, a: 1 })).toBe("rgb(255, 0, 0)");
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

// ============================================================================
// Three.js Dash Parameter Tests
// ============================================================================

describe("getThreeDashParams", () => {
  it("returns proportional dash/gap for dash-short (sus2)", () => {
    const params = getThreeDashParams("dash-short", 10);
    expect(params).not.toBeNull();
    expect(params!.dashSize).toBeCloseTo(0.5); // 10 * 0.05
    expect(params!.gapSize).toBeCloseTo(0.5); // equal dash and gap
  });

  it("returns longer dash for dash-long (sus4)", () => {
    const params = getThreeDashParams("dash-long", 10);
    expect(params).not.toBeNull();
    expect(params!.dashSize).toBeCloseTo(1.0); // 10 * 0.1
    expect(params!.gapSize).toBeCloseTo(0.5); // 10 * 0.05
  });

  it("scales with shape radius", () => {
    const small = getThreeDashParams("dash-short", 5);
    const large = getThreeDashParams("dash-short", 20);
    expect(large!.dashSize).toBe(small!.dashSize * 4);
  });

  it("returns null for non-dashed styles", () => {
    expect(getThreeDashParams("straight", 10)).toBeNull();
    expect(getThreeDashParams("wavy", 10)).toBeNull();
    expect(getThreeDashParams("concave", 10)).toBeNull();
    expect(getThreeDashParams("convex", 10)).toBeNull();
  });
});

// ============================================================================
// Dashed Margin SVG Regression Tests
// ============================================================================

describe("ChordShapeBuilder dashed margins", () => {
  function createSus2(): ChordShapeElement[] {
    return [
      makeElement(0, "triadic", "1"),
      makeElement(60, "triadic", "2"),   // sus2: 2nd at 60°
      makeElement(210, "triadic", "5"),
    ];
  }

  function createSus4(): ChordShapeElement[] {
    return [
      makeElement(0, "triadic", "1"),
      makeElement(150, "triadic", "4"),  // sus4: 4th at 150°
      makeElement(210, "triadic", "5"),
    ];
  }

  it("dash-short SVG path matches straight geometry (same arc shape)", () => {
    const straightBuilder = new ChordShapeBuilder(createSus2(), "straight", {
      scale: 100,
      center: { x: 200, y: 200 },
    });

    const dashBuilder = new ChordShapeBuilder(createSus2(), "dash-short", {
      scale: 100,
      center: { x: 200, y: 200 },
    });

    // Geometry is identical — dashing is a stroke attribute, not path shape
    expect(dashBuilder.toSVGPath()).toBe(straightBuilder.toSVGPath());
  });

  it("dash-long SVG path matches straight geometry", () => {
    const straightBuilder = new ChordShapeBuilder(createSus4(), "straight", {
      scale: 100,
      center: { x: 200, y: 200 },
    });

    const dashBuilder = new ChordShapeBuilder(createSus4(), "dash-long", {
      scale: 100,
      center: { x: 200, y: 200 },
    });

    expect(dashBuilder.toSVGPath()).toBe(straightBuilder.toSVGPath());
  });

  it("dash-short Three.js shape matches straight geometry", () => {
    const straightBuilder = new ChordShapeBuilder(createSus2(), "straight", {
      scale: 10,
      center: { x: 0, y: 0 },
    });

    const dashBuilder = new ChordShapeBuilder(createSus2(), "dash-short", {
      scale: 10,
      center: { x: 0, y: 0 },
    });

    const straightPoints = straightBuilder.toThreeShape().getPoints(20);
    const dashPoints = dashBuilder.toThreeShape().getPoints(20);

    expect(dashPoints.length).toBe(straightPoints.length);
    for (let i = 0; i < dashPoints.length; i++) {
      expect(dashPoints[i].x).toBeCloseTo(straightPoints[i].x, 5);
      expect(dashPoints[i].y).toBeCloseTo(straightPoints[i].y, 5);
    }
  });

  it("getMargin returns the dashed style", () => {
    const sus2Builder = new ChordShapeBuilder(createSus2(), "dash-short", {
      scale: 100,
      center: { x: 100, y: 100 },
    });
    expect(sus2Builder.getMargin()).toBe("dash-short");

    const sus4Builder = new ChordShapeBuilder(createSus4(), "dash-long", {
      scale: 100,
      center: { x: 100, y: 100 },
    });
    expect(sus4Builder.getMargin()).toBe("dash-long");
  });
});
