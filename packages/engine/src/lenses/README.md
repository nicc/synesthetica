# Lenses

Lenses transform `AnnotatedMusicalFrame` into `SceneFrame`. Each lens interprets musical data and produces visual entities according to its focus.

## Layout

Lenses share a three-column layout defined in `layout.ts`:

- **Left column** — `DynamicsLens` (VU-meter bar with fading velocity indicators)
- **Center column** — `RhythmLens` (pitch-class note strips, beat grid, now-line)
- **Right column** — `HarmonyLens` (chord shape top cell, progression placeholder bottom cell)

See `layout.ts` for exact coordinates and proportions.

## Development Approach

Lens development uses an incremental process with multiple feedback mechanisms:

### 0. Design Partnership

Before any implementation, use conversation to develop the visual concept. The user thinks out loud — offering rough, unstructured ideas — and the agent helps refine them: asking clarifying questions, identifying tensions between ideas, proposing concrete alternatives, and converging toward something implementable. No code is written during this phase. Read `PRINCIPLES.md` before engaging — the principles constrain all design decisions.

### 1. ASCII Diagrams for Intent

Once the concept is clear, describe visual intent using ASCII/text diagrams. This establishes shared understanding of what the lens should produce.

### 2. SVG Snapshots for Visual Feedback

Tests generate SVG snapshots of SceneFrame output. These provide visual feedback without running the full application:

```bash
GENERATE_SNAPSHOTS=1 npm test -w packages/engine
```

Snapshots live in `test/_snapshots/` (gitignored) and can be opened in a browser for review.

### 3. Simulation Metrics for Properties

Tests emit quantitative metrics (entity counts, position distributions, color clustering) that can be analyzed without visual inspection. This supports Principle 8 (Experiential Feedback Through Simulation).

### 4. Parameter Exploration

Key visual parameters are exposed as adjustable constants. During development, these can be tweaked interactively to find good values before hardcoding.

### 5. Incremental Building

Lenses are built one visual element at a time:
1. Implement the simplest element
2. Generate snapshots and review
3. Iterate until correct
4. Add the next element
5. Repeat

This avoids large changes that are hard to debug and keeps feedback loops tight.

## Compositing Considerations

Lenses produce entities that are composed with other lenses. The compositor merges entity lists from all active lenses into a single `SceneFrame` for the renderer.

Design entities with composability in mind:
- Use meaningful `kind` values (field, particle, glyph)
- Position entities within the lens's column (see `layout.ts`)
- Avoid assumptions about being the only lens

## Test Fixtures

Lens tests should cover a wide range of inputs:
- Sparse notes (1-2 notes)
- Dense notes (many simultaneous)
- Silence (no active notes)
- Tempo changes
- Subdivision variety
- Tier transitions (1 → 2 → 3)

See `test/_fixtures/` for fixture format and `test/_harness/frames.ts` for shared frame factories.

## Current Lenses

- `RhythmLens` — Pitch-class note strips with beat/bar grid, drift streaks, and now-line
- `HarmonyLens` — Chord shape visualization with radial geometry and gradient fill
- `DynamicsLens` — Vertical VU-meter bar with fading velocity indicators
- `TestChordProgressionLens` — Legacy toy lens for chord visualization (to be retired)
