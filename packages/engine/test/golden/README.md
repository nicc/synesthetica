# Golden Tests

Golden tests compare module output against saved "known good" fixtures. They catch unintended regressions when iterating on implementations.

## Directory Structure

```
test/golden/
├── fixtures/           # JSON fixture files
│   ├── stabilizer/     # Stabilizer boundary fixtures
│   └── ruleset/        # Ruleset invariant fixtures
├── stabilizer/         # Stabilizer boundary tests
├── ruleset/            # Ruleset invariant tests
├── harness.ts          # Test utilities
└── README.md           # This file
```

## When to Use Golden Tests

**Use golden tests for:**
- Boundary contracts between modules (stabilizer output, ruleset output)
- Detecting unintended changes to established behavior
- Documenting expected transformations with concrete examples

**Don't use golden tests for:**
- Internal implementation details
- Behaviors that are still forming
- Properties better expressed as unit tests

## Writing a Golden Test

### 1. Create a Fixture

Fixtures are JSON files in `fixtures/<boundary>/`:

```json
{
  "description": "Single note produces one Note with attack phase",
  "input": {
    "t": 0,
    "source": "midi",
    "stream": "test",
    "inputs": [
      { "type": "midi_note_on", "t": 0, "note": 60, "velocity": 100, "channel": 0 }
    ]
  },
  "expected": {
    "t": 0,
    "part": "default",
    "notes": [
      {
        "id": "default:0:C4",
        "pitch": { "pc": 0, "octave": 4 },
        "velocity": 100,
        "onset": 0,
        "duration": 0,
        "release": null,
        "phase": "attack",
        "confidence": 1.0,
        "provenance": { "sourceId": "midi", "streamId": "test" }
      }
    ],
    "chords": [],
    "beat": null,
    "dynamics": { "level": 0.787, "trend": "stable" }
  }
}
```

### 2. Write the Test

```typescript
import { describe, it } from 'vitest';
import { loadFixture, expectFrameEquals, type Fixture } from '../harness';
import type { RawInputFrame, MusicalFrame } from '@synesthetica/contracts';
import { NoteTrackingStabilizer } from '../../../src/stabilizers/NoteTrackingStabilizer';

type StabilizerFixture = Fixture<RawInputFrame, MusicalFrame>;

describe('NoteTrackingStabilizer golden tests', () => {
  it('basic-note', () => {
    const fixture = loadFixture<StabilizerFixture>('stabilizer/note-tracking/basic-note.json');
    const stabilizer = new NoteTrackingStabilizer();
    const actual = stabilizer.process(fixture.input);
    expectFrameEquals(actual, fixture.expected);
  });
});
```

### 3. Handling Float Comparisons

For fields with floating point values, use the `floatTolerance` option:

```typescript
expectFrameEquals(actual, fixture.expected, { floatTolerance: 0.001 });
```

### 4. Ignoring Transient Fields

To exclude certain fields from comparison:

```typescript
expectFrameEquals(actual, fixture.expected, { ignoreFields: ['id', 'timestamp'] });
```

## Updating Fixtures

When behavior intentionally changes, update fixtures with:

```bash
UPDATE_GOLDEN=1 npm test
```

This writes actual output to fixture files. Review changes before committing.

## Boundaries Covered

### Stabilizer Boundary (RawInputFrame → MusicalFrame)

Tests that stabilizers produce correct musical abstractions from raw input.

- Note tracking: on/off correlation, phase transitions, duration
- (Future) Chord detection: quality identification from note sets
- (Future) Beat tracking: tempo and phase detection

### Ruleset Invariants (MusicalFrame → VisualIntentFrame)

Property-based tests for synesthetic mappings.

- Pitch class → hue mapping
- Velocity → brightness mapping
- (Future) Chord quality → color temperature

## Design Rationale

Golden tests complement unit tests:

| Unit Tests | Golden Tests |
|------------|--------------|
| Test internal logic | Test boundary contracts |
| Fine-grained assertions | Whole-output comparison |
| Fast to write | Documenting examples |
| Implementation-aware | Specification-focused |

Golden tests are more stable than unit tests when implementations change but contracts remain the same.
