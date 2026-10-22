# Lenses

Lenses transform `AnnotatedMusicalFrame` into `SceneFrame`. Each lens interprets musical data and produces visual entities according to its focus.

## Layout

Lenses share a three-column layout defined in `layout.ts`:

- **Left column** — `DynamicsLens` (VU-meter bar with fading velocity indicators)
- **Center column** — `RhythmLens` (pitch-class note strips, beat grid, NOW line)
- **Right column** — `HarmonyLens` (chord glyph in the top cell, progression clock in the bottom cell)

See `layout.ts` for exact coordinates and proportions, and `timeMapping.ts` for the NOW line position and time-to-Y mapping.

## Development Approach

Lens development uses an incremental process with multiple feedback mechanisms:

### 0. Design Partnership

Before any implementation, use conversation to develop the visual concept. The user thinks out loud — offering rough, unstructured ideas — and the agent helps refine them: asking clarifying questions, identifying tensions between ideas, proposing concrete alternatives, and converging toward something implementable. No code is written during this phase. Read `PRINCIPLES.md` before engaging — the principles constrain all design decisions.

### 1. ASCII Diagrams for Intent

Once the concept is clear, describe visual intent using ASCII/text diagrams. This establishes shared understanding of what the lens should produce.

Where the design is quantitative (positions, levels, thresholds), generate the ASCII from a script using the real constants, rather than drawing it by hand, and list the design's checkable claims with their computed values alongside it. See PRINCIPLES.md §8.

### 2. SVG Snapshots for Visual Feedback

SVG snapshots of SceneFrame output give visual feedback without running the full application. They are review artefacts, not tests: generators live next to the tests as `test/**/<Name>.snapshot.ts` (e.g. `test/lenses/RhythmLens.snapshot.ts`) and are excluded from `npm test`.

```bash
npm run snapshots -w packages/engine
```

This runs `vitest.snapshots.config.ts`, which sets `GENERATE_SNAPSHOTS=1` and writes SVGs to `test/_snapshots/<lens>/` (gitignored) for opening in a browser. A snapshot file asserts no more than that an SVG was produced. When a scene shows a behaviour worth protecting, assert that behaviour in the sibling `.test.ts` instead.

Rendering helpers live in `test/_harness/`: `svg-snapshot.ts` renders a SceneFrame, `harmonySvg.ts` renders the harmony lens's chord shape, and `rhythmFixtures.ts` / `harmonyFixtures.ts` build the frames shared by tests and snapshots.

### 3. Simulation Metrics for Properties

`extractMetrics` summarises a scene quantitatively (entity counts, position distributions, colour clustering). Each scene SVG carries these metrics in a header comment, so they can be read without visual inspection. This supports Principle 8 (Experiential Feedback Through Simulation). Properties drawn from the metrics belong in the `.test.ts` as assertions; diagnostics never go to the console.

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
- Rhythm tier transitions (1 free time → 2 tempo → 3 tempo and meter)

Shared frame factories are in `test/_harness/frames.ts`, `rhythmFixtures.ts` and `harmonyFixtures.ts`. `test/_fixtures/` holds stabilizer fixtures only.

## Current Lenses

- `RhythmLens` — Pitch-class note strips with beat/bar grid, drift streaks, NOW line, note-name legend, and optional overtone strips
- `HarmonyLens` — Chord glyph (with overtone halo and interval-name dial) and the functional-harmony progression clock, plus a scrolling Roman-numeral strip beside the rhythm lens, on its time axis
- `DynamicsLens` — Vertical VU-meter bar with fading velocity indicators

Visual element terms are defined in [GLOSSARY.md](GLOSSARY.md).
