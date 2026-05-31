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
- **BeatDetectionStabilizer:** Detects tempo and beat phase from note onset timing patterns

Planned stabilizers (see beads issues):

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

- **Limited stabilizers:** Note tracking, chord detection, and beat detection work; dynamics, phrase, and progression stabilizers are planned.
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

## Playful Branches

For aesthetic experiments — alternate renderers, visual modes, "what if it looked like X" exercises — we use a deliberate **branch-per-experiment** workflow that stays separate from `main`. The branch is the artefact; nothing has to merge back.

Examples that exist today:

- [`ascii`](https://github.com/nicc/synesthetica/tree/ascii) — character-grid renderer, `?renderer=ascii`
- [`ghibli-render`](https://github.com/nicc/synesthetica/tree/ghibli-render) — painterly WebGL with sky gradient, bloom, dust motes, `?renderer=ghibli`
- [`i-robot`](https://github.com/nicc/synesthetica/tree/i-robot) — flat-shaded primary-palette arcade renderer, `?renderer=i-robot`

See [packages/engine/src/renderers/README.md](packages/engine/src/renderers/README.md) for the up-to-date catalogue.

### When to use this workflow

- A visual register that's recognisably its own thing (a film studio, a game, an art style)
- An output medium that doesn't fit the canonical Three.js renderer (DOM, SVG, terminal)
- Anything explicitly "for fun" or "as an experiment"

NOT for:

- Production features (those go through specs + beads issues)
- Bug fixes (those land on `main`)
- Refactors of canonical code

### Lifecycle

1. **Branch from `main`** with a name that says what it is: `ascii`, `ghibli-render`, `i-robot`, `noir`, `synthwave`, etc. Hyphenated, lowercase.
2. **Build the experiment.** For WebGL variants, *subclass* `ThreeJSRenderer` and override the protected hooks (see below). For non-WebGL media (DOM, SVG, terminal), implement `IRenderer` directly.
3. **Wire a URL parameter** in `packages/web-app/src/main.ts`: `?renderer=<name>`. Default stays Three.js. Renderer choice is read once at session start; refresh to switch.
4. **Add the renderer to `packages/engine/src/renderers/index.ts`** and `packages/engine/src/renderers/README.md`'s catalogue.
5. **Push the branch.** Do not open a PR or merge to `main`.
6. **Stay there indefinitely.** Revisit when you want. If you discover something useful while building (e.g. an additive contract change), cherry-pick *that small thing* forward to `main`.

### What doesn't apply

- **No spec, no tests for the renderer itself.** These are aesthetic experiments, not architecture. The canonical renderer has tests; experiment renderers don't.
- **No beads issues for the experiment as a whole.** File one if you discover a bug in the canonical code while building.
- **No requirement to track `main`.** Branches can diverge freely; rebasing isn't expected. If `main` evolves something useful (new contract field, etc.), pull or rebase only when you next pick the branch up.

### Subclassing `ThreeJSRenderer`

The canonical Three.js renderer exposes a small, deliberate set of `protected` extension points for these forks. Use them rather than copying the file:

- `protected config` — world dimensions and other config
- `protected renderer` — the underlying `THREE.WebGLRenderer`
- `protected scene` — the Three.js scene (add background quads, particle systems, etc. here)
- `protected camera` — the perspective camera
- `protected hsvToThreeColor()` — colour mapping called by every entity render path. Override this to skin the entire image's palette in one place.

`id` is widened to `string` (not the literal `"threejs"`) so subclasses can declare their own identifier.

If an experiment needs access to something else in `ThreeJSRenderer`, **promote that member to `protected` rather than copying the renderer**. That keeps experiments small and lets the canonical renderer evolve underneath them.

### Communicating about active branches

When demoing or sharing, prefer the URL form (`localhost:3000/?renderer=ghibli`) over describing the branch. The URL is the user-facing surface; the branch is the implementation. If you want to demo without the audio adapter or other in-progress main-branch work, there's a `demo-pre-audio` branch that holds the last all-tested-by-Nic state — see git for the exact base commit if it needs to be re-cut.

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
