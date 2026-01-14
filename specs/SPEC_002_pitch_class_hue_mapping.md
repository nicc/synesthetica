# SPEC 002: Pitch-Class to Hue Mapping

Status: Approved
Date: 2026-01-14
Source: RFC 002

## Summary

Defines the deterministic mapping from pitch-class to hue, a core visual invariant.

## The Invariant

Pitch-class determines hue. This mapping is:
- **Deterministic** — same pitch always produces same hue
- **Learnable** — users develop intuition over time
- **Inviolable** — styles cannot override this mapping

## Formula

```ts
function pcToHue(pc: PitchClass, inv: PitchHueInvariant): number {
  const dir = inv.direction === "ccw" ? -1 : 1;
  const steps = (pc - inv.referencePc + 12) % 12;
  return (inv.referenceHue + dir * steps * 30 + 360) % 360;
}
```

## Parameters

```ts
interface PitchHueInvariant {
  referencePc: PitchClass;  // default: 9 (A)
  referenceHue: number;     // default: 0 (red)
  direction?: "cw" | "ccw"; // default: "cw" (clockwise)
}
```

## Default Configuration

| Parameter | Default | Meaning |
|-----------|---------|---------|
| referencePc | 9 | A = reference pitch |
| referenceHue | 0 | Red = reference hue |
| direction | "cw" | Ascending pitch = clockwise hue rotation |

## Resulting Hue Circle (defaults)

| Pitch | PC | Hue |
|-------|-----|-----|
| A | 9 | 0° (red) |
| A#/Bb | 10 | 30° |
| B | 11 | 60° (yellow) |
| C | 0 | 90° |
| C#/Db | 1 | 120° (green) |
| D | 2 | 150° |
| D#/Eb | 3 | 180° (cyan) |
| E | 4 | 210° |
| F | 5 | 240° (blue) |
| F#/Gb | 6 | 270° |
| G | 7 | 300° (magenta) |
| G#/Ab | 8 | 330° |

## Constraints

- Each semitone = 30° hue rotation
- The full chromatic scale spans the complete hue circle
- Octave equivalence: C4 and C5 produce identical hue

## What This Means for Styles

Styles receive hue values via `PaletteIntent.base.h`. They:
- **MAY** adjust saturation and brightness
- **MAY** add visual noise based on uncertainty
- **MUST NOT** recompute hue from pitch data
- **MUST NOT** override the pitch→hue relationship

## Contract Location

Types defined in `packages/contracts/intents/colors.ts`:
- `PitchHueInvariant`
- `pcToHue()`
