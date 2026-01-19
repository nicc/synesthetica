# Contributing to Synesthetica

## Development Workflow: Iterating on the Instrument

The "instrument" is the combination of stabilizers + rulesets + grammars that define how music maps to visuals. This is the creative core of Synesthetica.

### The Iteration Loop

1. **Run the dev server**
   ```bash
   cd packages/web-app
   npm run dev:chrome
   ```
   Connect your MIDI device and verify the current behavior.

2. **Identify what to change**
   - Musical context (chord detection, beat tracking) → edit stabilizers
   - Musical interpretation (pitch → hue, chord quality → warm/cool palette) → edit ruleset
   - Visual form (which elements to render, particles vs trails vs fields) → edit grammar
   - All three can change independently

3. **Make focused changes**
   - **Stabilizers:** Edit files in [packages/engine/src/stabilizers/](packages/engine/src/stabilizers/)
   - **Rulesets:** Edit files in [packages/engine/src/rulesets/](packages/engine/src/rulesets/)
   - **Grammars:** Edit files in [packages/engine/src/grammars/](packages/engine/src/grammars/)
   - Keep changes small and testable

4. **See results immediately**
   - Vite hot-reloads on file save
   - Play notes on your MIDI keyboard
   - Observe visual output

5. **Verify contract compliance**
   ```bash
   npm run build -ws   # TypeScript will catch contract violations
   ```

6. **Document learnings**
   - What musical quality did you try to express?
   - Did the visual output match your intent?
   - What surprised you?
   - What spec gaps did you discover?

### What to Build First

The Phase 0 pipeline is minimal. Here are directions to explore:

#### Stabilizers (Musical Context)

Stabilizers transform raw input into musical abstractions. Currently implemented:

- **NoteTrackingStabilizer:** Tracks note lifecycle (attack → sustain → release)
- **ChordDetectionStabilizer:** Identifies chord quality from active notes

Planned stabilizers (see beads issues):

- **BeatDetectionStabilizer:** Detect tempo and downbeats from timing patterns
- **DynamicsStabilizer:** Analyze velocity patterns
- **PhraseDetectionStabilizer:** Recognize phrase boundaries
- **ProgressionStabilizer:** Track chord progressions over time

Stabilizers form a DAG based on dependencies. Independent stabilizers (note tracking, beat detection) process raw input; derived stabilizers (chord detection, phrase detection) require upstream output. Stabilizers enrich `MusicalFrame` with notes, chords, progression, phrases, beat, and dynamics.

#### Rulesets (Musical Interpretation)

Rulesets annotate musical elements with visual properties. Current ruleset:

- **MusicalVisualRuleset:** pitch → hue, velocity → brightness, chord quality → warm/cool palette

Rulesets define a *visual vocabulary* that users learn. Key principle: rulesets do NOT decide what shapes to use or which elements to render. They say "major chords are warm colors" - a consistent scheme across all grammars.

Directions to explore:

- **Harmonic awareness:** Map chord quality to color temperature, tension to saturation
- **Temporal patterns:** Different motion annotations for sustained notes vs staccato
- **Richer palettes:** Primary, secondary, accent colors per musical element

#### Grammars (Visual Form)

Grammars receive `AnnotatedMusicalFrame` and decide how to render it. Current grammars:

- **TestRhythmGrammar:** Renders beats and notes as timing markers (ignores chords)
- **TestChordProgressionGrammar:** Renders chords as glows with history trail (ignores beats)

Grammars know *what kind* of element something is (note vs chord vs beat) but not musical analysis details (pitch class, chord quality). They use visual annotations to style their chosen representations.

Directions to explore:

- **Trail grammar:** Notes leave fading paths
- **Field grammar:** Background color shifts with harmony
- **Glyph grammar:** Place symbolic shapes based on note annotations
- **Stack grammars:** Layer multiple visual elements

**Key insight:** Grammars have creative agency. They decide which musical elements to render, what shapes to use, and how to animate. Different grammars can render the same annotated content completely differently.

### Current Constraints (Phase 0)

- **Limited stabilizers:** Note tracking and chord detection work; beat, dynamics, phrase, and progression stabilizers are planned.
- **Single part:** Multi-instrument support exists in the architecture but isn't wired up yet.
- **No presets:** Each iteration requires code changes. Preset system comes later.
- **No LLM control:** Parameter adjustments are manual. Speech interface comes later.

These constraints force focus on the core question: "Given musical data, what visual mapping makes sense?"

### When You Hit a Spec Gap

If you discover something underspecified (entity lifecycle, coordinate systems, parameter ranges):

1. Note the ambiguity in code comments
2. Make a reasonable local decision to unblock yourself
3. Document the decision and alternatives in an RFC or spec update
4. Continue iterating

Early iteration reveals what needs specification. Write enough spec to stay consistent, no more.

## Code Organization

### Package Structure

- **[packages/contracts](packages/contracts/)** - Type definitions and interfaces. All module boundaries live here.
- **[packages/adapters](packages/adapters/)** - Input adapters (MIDI, audio)
- **[packages/engine](packages/engine/)** - Pipeline components (stabilizers, rulesets, grammars)
- **[packages/web-app](packages/web-app/)** - Web application shell

### Contract Discipline

All imports of shared types must come from `@synesthetica/contracts`, not internal paths. This is enforced by ESLint.

```typescript
// Good
import type { MusicalFrame } from '@synesthetica/contracts';

// Bad - will fail lint
import type { MusicalFrame } from '../contracts/musical/musical';
```

Run `npm run lint` before committing. Most violations are auto-fixable with `npm run lint:fix`.

### Type-Only Imports

Use `import type` for type-only imports. This is enforced by the `consistent-type-imports` ESLint rule.

```typescript
// Good
import type { Entity } from '@synesthetica/contracts/scene';
import { createEntity } from './utils';

// Bad - will fail lint
import { Entity } from '@synesthetica/contracts/scene';
```

## Testing

**Test runner:** vitest

**Principles:**
- Use dependency injection to decouple from browser APIs (Web MIDI, Web Audio, Canvas)
- Test transformation logic with mocks, not browser environments
- Keep tests fast

**Current patterns:**
- `MidiSource` interface allows testing `MidiAdapter` without Web MIDI API
- Tests live in `packages/<pkg>/test/` mirroring `src/` structure
- Run with `npm test` (per-package) or `npm test -ws` (all packages)

## Issue Tracking

This project uses **bd** (beads) for issue tracking. See [AGENTS.md](AGENTS.md) for workflow details.

## Commit Messages

Summarize product work in commit messages. The git log is a project history.

```bash
# Good
git commit -m "Add chord detection stabilizer

Maps active notes to chord quality (major/minor/dim).
Uses simplified triadic detection for Phase 1."

# Bad
git commit -m "bd sync"
```

For mixed commits (code + issues), lead with the code change.

## Communication Style

Use simple, direct language. Do not hype. See [AGENTS.md](AGENTS.md) for detailed guidance.
