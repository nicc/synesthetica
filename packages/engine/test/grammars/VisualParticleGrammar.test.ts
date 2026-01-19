import { describe, it, expect, beforeEach } from "vitest";
import { VisualParticleGrammar } from "../../src/grammars/VisualParticleGrammar";
import type {
  VisualIntentFrame,
  GrammarContext,
  PaletteIntent,
  MotionIntent,
} from "@synesthetica/contracts";

function makePaletteIntent(
  id: string,
  t: number,
  hue: number,
  brightness: number,
  alpha = 1,
  stability = 0.8
): PaletteIntent {
  return {
    type: "palette",
    id,
    t,
    base: { h: hue, s: 0.8, v: brightness, a: alpha },
    stability,
    confidence: 1,
  };
}

function makeMotionIntent(
  id: string,
  t: number,
  pulse: number,
  flow = 0,
  jitter = 0
): MotionIntent {
  return {
    type: "motion",
    id,
    t,
    pulse,
    flow,
    jitter,
    confidence: 1,
  };
}

function makeFrame(t: number, intents: (PaletteIntent | MotionIntent)[]): VisualIntentFrame {
  return {
    t,
    intents,
    uncertainty: 0,
  };
}

describe("VisualParticleGrammar", () => {
  let grammar: VisualParticleGrammar;
  let ctx: GrammarContext;

  beforeEach(() => {
    grammar = new VisualParticleGrammar();
    ctx = {
      canvasSize: { width: 800, height: 600 },
      rngSeed: 12345,
      part: "test-part",
    };
    grammar.init(ctx);
  });

  describe("basic functionality", () => {
    it("returns empty entities for empty intents", () => {
      const frame = makeFrame(0, []);
      const result = grammar.update(frame, null);

      expect(result.entities).toHaveLength(0);
      expect(result.t).toBe(0);
    });

    it("creates entity for palette intent with ID", () => {
      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8),
      ]);

      const result = grammar.update(frame, null);

      expect(result.entities).toHaveLength(1);
      expect(result.entities[0].kind).toBe("particle");
      expect(result.entities[0].part).toBe("test-part");
    });

    it("ignores palette intents without ID", () => {
      const intent: PaletteIntent = {
        type: "palette",
        // no id
        t: 100,
        base: { h: 0, s: 0.8, v: 0.8, a: 1 },
        stability: 0.8,
        confidence: 1,
      };
      const frame: VisualIntentFrame = {
        t: 100,
        intents: [intent],
        uncertainty: 0,
      };

      const result = grammar.update(frame, null);

      expect(result.entities).toHaveLength(0);
    });

    it("throws if not initialized", () => {
      const uninitializedGrammar = new VisualParticleGrammar();
      const frame = makeFrame(100, []);

      expect(() => uninitializedGrammar.update(frame, null)).toThrow(
        "not initialized"
      );
    });
  });

  describe("intent to position mapping", () => {
    it("maps hue to x position", () => {
      // Hue 0 (red) should be at left
      const frame1 = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8),
      ]);
      const result1 = grammar.update(frame1, null);
      const x1 = result1.entities[0].position!.x;

      // Reinitialize for clean state
      grammar.init(ctx);

      // Hue 180 (cyan) should be in middle
      const frame2 = makeFrame(100, [
        makePaletteIntent("note-2", 100, 180, 0.8),
      ]);
      const result2 = grammar.update(frame2, null);
      const x2 = result2.entities[0].position!.x;

      expect(x2).toBeGreaterThan(x1);
    });

    it("maps brightness to y position (brighter = higher)", () => {
      // Low brightness should be lower (higher y value)
      const frame1 = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.3),
      ]);
      const result1 = grammar.update(frame1, null);
      const y1 = result1.entities[0].position!.y;

      grammar.init(ctx);

      // High brightness should be higher (lower y value)
      const frame2 = makeFrame(100, [
        makePaletteIntent("note-2", 100, 0, 1.0),
      ]);
      const result2 = grammar.update(frame2, null);
      const y2 = result2.entities[0].position!.y;

      expect(y2).toBeLessThan(y1);
    });
  });

  describe("intent lifecycle", () => {
    it("maintains entity while intent is present", () => {
      const intent = makePaletteIntent("note-1", 100, 0, 0.8);

      const frame1 = makeFrame(100, [intent]);
      const result1 = grammar.update(frame1, null);
      expect(result1.entities).toHaveLength(1);
      const entityId = result1.entities[0].id;

      // Same intent in next frame
      const frame2 = makeFrame(200, [{ ...intent, t: 200 }]);
      const result2 = grammar.update(frame2, result1);
      expect(result2.entities).toHaveLength(1);
      expect(result2.entities[0].id).toBe(entityId);
    });

    it("starts fading when intent disappears", () => {
      const intent = makePaletteIntent("note-1", 100, 0, 0.8);

      // Intent present
      const frame1 = makeFrame(100, [intent]);
      const result1 = grammar.update(frame1, null);
      expect(result1.entities[0].style.opacity).toBe(1);

      // Intent gone - fade starts (but no progress yet)
      const frame2 = makeFrame(200, []);
      const result2 = grammar.update(frame2, result1);
      expect(result2.entities).toHaveLength(1);
      expect(result2.entities[0].style.opacity).toBe(1); // No time has passed since fade started

      // Next frame - should now show fade progress
      const frame3 = makeFrame(450, []); // 250ms into 500ms fade = 50% faded
      const result3 = grammar.update(frame3, result2);
      expect(result3.entities).toHaveLength(1);
      expect(result3.entities[0].style.opacity).toBeCloseTo(0.5, 1);
    });

    it("removes entity after fadeOutMs", () => {
      grammar = new VisualParticleGrammar({ fadeOutMs: 500 });
      grammar.init(ctx);

      const intent = makePaletteIntent("note-1", 100, 0, 0.8);

      // Intent present
      const frame1 = makeFrame(100, [intent]);
      const result1 = grammar.update(frame1, null);

      // Intent gone
      const frame2 = makeFrame(200, []);
      const result2 = grammar.update(frame2, result1);
      expect(result2.entities).toHaveLength(1);

      // After fadeOutMs
      const frame3 = makeFrame(800, []);
      const result3 = grammar.update(frame3, result2);
      expect(result3.entities).toHaveLength(0);
    });

    it("restores entity if intent reappears during fade", () => {
      grammar = new VisualParticleGrammar({ fadeOutMs: 500 });
      grammar.init(ctx);

      const intent = makePaletteIntent("note-1", 100, 0, 0.8);

      // Intent present
      const frame1 = makeFrame(100, [intent]);
      const result1 = grammar.update(frame1, null);

      // Intent gone - start fading
      const frame2 = makeFrame(200, []);
      const result2 = grammar.update(frame2, result1);
      expect(result2.entities[0].style.opacity).toBe(1); // Fade just started

      // Some time passes, fade progresses
      const frame3 = makeFrame(350, []);
      const result3 = grammar.update(frame3, result2);
      expect(result3.entities[0].style.opacity).toBeCloseTo(0.7, 1); // 150ms into 500ms fade

      // Intent reappears - should restore full opacity
      const frame4 = makeFrame(400, [{ ...intent, t: 400 }]);
      const result4 = grammar.update(frame4, result3);
      expect(result4.entities).toHaveLength(1);
      expect(result4.entities[0].style.opacity).toBe(1);
    });
  });

  describe("style from intent", () => {
    it("uses intent color", () => {
      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 120, 0.9), // Green, bright
      ]);

      const result = grammar.update(frame, null);

      expect(result.entities[0].style.color).toBeDefined();
      expect(result.entities[0].style.color!.h).toBe(120);
      expect(result.entities[0].style.color!.v).toBe(0.9);
    });

    it("uses intent alpha for opacity", () => {
      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8, 0.5),
      ]);

      const result = grammar.update(frame, null);

      expect(result.entities[0].style.opacity).toBe(0.5);
    });

    it("scales size based on brightness", () => {
      // Low brightness
      const frame1 = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.3),
      ]);
      const result1 = grammar.update(frame1, null);
      const size1 = result1.entities[0].style.size!;

      grammar.init(ctx);

      // High brightness
      const frame2 = makeFrame(100, [
        makePaletteIntent("note-2", 100, 0, 1.0),
      ]);
      const result2 = grammar.update(frame2, null);
      const size2 = result2.entities[0].style.size!;

      expect(size2).toBeGreaterThan(size1);
    });

    it("stores stability in entity data", () => {
      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8, 1, 0.3), // Low stability
      ]);

      const result = grammar.update(frame, null);

      expect(result.entities[0].data?.stability).toBe(0.3);
    });
  });

  describe("multiple intents", () => {
    it("creates entities for all palette intents", () => {
      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8),
        makePaletteIntent("note-2", 100, 120, 0.7),
        makePaletteIntent("note-3", 100, 240, 0.6),
      ]);

      const result = grammar.update(frame, null);

      expect(result.entities).toHaveLength(3);
    });

    it("fades individual entities when their intents disappear", () => {
      grammar = new VisualParticleGrammar({ fadeOutMs: 500 });
      grammar.init(ctx);

      // Start with 3 intents
      const frame1 = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8),
        makePaletteIntent("note-2", 100, 120, 0.7),
        makePaletteIntent("note-3", 100, 240, 0.6),
      ]);
      const result1 = grammar.update(frame1, null);
      expect(result1.entities).toHaveLength(3);

      // Remove one intent (note-2)
      const frame2 = makeFrame(200, [
        makePaletteIntent("note-1", 200, 0, 0.8),
        makePaletteIntent("note-3", 200, 240, 0.6),
      ]);
      const result2 = grammar.update(frame2, result1);
      expect(result2.entities).toHaveLength(3); // Still 3, one is fading (but no progress yet)

      // Wait for fade to progress
      const frame3 = makeFrame(450, [
        makePaletteIntent("note-1", 450, 0, 0.8),
        makePaletteIntent("note-3", 450, 240, 0.6),
      ]);
      const result3 = grammar.update(frame3, result2);
      expect(result3.entities).toHaveLength(3);

      // The fading one should have lower opacity (250ms into 500ms fade = 50%)
      const opacities = result3.entities.map((e) => e.style.opacity);
      expect(opacities.some((o) => o !== undefined && o < 1)).toBe(true);
    });
  });

  describe("motion intent application", () => {
    it("applies upward drift from pulse", () => {
      const frame1 = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8),
        makeMotionIntent("motion-1", 100, 0.8), // High pulse
      ]);
      const result1 = grammar.update(frame1, null);
      const y1 = result1.entities[0].position!.y;

      // Update with same intents - motion should affect position
      const frame2 = makeFrame(200, [
        makePaletteIntent("note-1", 200, 0, 0.8),
        makeMotionIntent("motion-1", 200, 0.8),
      ]);
      const result2 = grammar.update(frame2, result1);
      const y2 = result2.entities[0].position!.y;

      // Position should have moved up (lower y)
      expect(y2).toBeLessThan(y1);
    });
  });

  describe("entity IDs", () => {
    it("generates unique entity IDs", () => {
      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8),
        makePaletteIntent("note-2", 100, 120, 0.7),
      ]);

      const result = grammar.update(frame, null);

      const ids = result.entities.map((e) => e.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("includes part in entity ID", () => {
      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 0.8),
      ]);

      const result = grammar.update(frame, null);

      expect(result.entities[0].id).toContain("test-part");
    });
  });

  describe("configuration", () => {
    it("uses custom fadeOutMs", () => {
      grammar = new VisualParticleGrammar({ fadeOutMs: 1000 });
      grammar.init(ctx);

      const intent = makePaletteIntent("note-1", 100, 0, 0.8);

      const frame1 = makeFrame(100, [intent]);
      grammar.update(frame1, null);

      // After 500ms without intent - should still be visible with 1000ms fade
      const frame2 = makeFrame(200, []);
      const result2 = grammar.update(frame2, null);
      expect(result2.entities).toHaveLength(1);
      expect(result2.entities[0].style.opacity).toBeGreaterThan(0);

      // At 50% through fade
      const frame3 = makeFrame(700, []);
      const result3 = grammar.update(frame3, result2);
      expect(result3.entities).toHaveLength(1);
      expect(result3.entities[0].style.opacity).toBeCloseTo(0.5, 1);
    });

    it("uses custom baseSize", () => {
      grammar = new VisualParticleGrammar({ baseSize: 40 });
      grammar.init(ctx);

      const frame = makeFrame(100, [
        makePaletteIntent("note-1", 100, 0, 1.0), // Max brightness
      ]);

      const result = grammar.update(frame, null);

      // Size should be baseSize * (0.5 + brightness * 0.5) = 40 * 1.0 = 40
      expect(result.entities[0].style.size).toBe(40);
    });
  });
});
