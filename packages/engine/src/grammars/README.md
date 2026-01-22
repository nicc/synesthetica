# Grammars

Grammars transform `AnnotatedMusicalFrame` into `SceneFrame`. Each grammar interprets musical data and produces visual entities according to its focus (rhythm, harmony, melody, etc.).

## Development Approach

Grammar development uses an incremental process with multiple feedback mechanisms:

### 1. ASCII Diagrams for Intent

Before implementing, describe visual intent using ASCII/text diagrams. This establishes shared understanding of what the grammar should produce.

### 2. SVG Snapshots for Visual Feedback

Tests generate SVG snapshots of SceneFrame output. These provide visual feedback without running the full application:

```bash
npm test -- --update-snapshots  # Generate/update snapshots
```

Snapshots live in `test/_snapshots/grammars/` and can be opened in a browser for review.

### 3. Simulation Metrics for Properties

Tests emit quantitative metrics (entity counts, position distributions, color clustering) that can be analyzed without visual inspection. This supports Principle 8 (Experiential Feedback Through Simulation).

### 4. Parameter Exploration

Key visual parameters are exposed as adjustable constants. During development, these can be tweaked interactively to find good values before hardcoding.

### 5. Incremental Building

Grammars are built one visual element at a time:
1. Implement the simplest element
2. Generate snapshots and review
3. Iterate until correct
4. Add the next element
5. Repeat

This avoids large changes that are hard to debug and keeps feedback loops tight.

## Compositing Considerations

Grammars should produce entities that can be composed with other grammars. Current assumption: grammars emit independent entities and the compositor merges them. This may evolve toward grammars emitting intent about shared entities (e.g., notes) with the compositor resolving conflicts.

Design entities with this uncertainty in mind:
- Use meaningful `kind` values (field, particle, etc.)
- Position entities to leave room for other grammars
- Avoid assumptions about being the only grammar

## Test Fixtures

Grammar tests should cover a wide range of inputs:
- Sparse notes (1-2 notes)
- Dense notes (many simultaneous)
- Silence (no active notes)
- Tempo changes
- Subdivision variety
- Tier transitions (1 → 2 → 3)

See `test/_fixtures/` for fixture format.

## Current Grammars

- `TestRhythmGrammar` - Toy grammar for rhythm visualization (to be replaced by `RhythmGrammar`)
- `TestChordProgressionGrammar` - Toy grammar for chord visualization

## Related

- [claude.md](../../../claude.md) - References this development approach
- [synesthetica-o1v](/.beads/) - RhythmGrammar implementation issue
