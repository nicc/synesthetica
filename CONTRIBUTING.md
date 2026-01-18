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
   - Musical interpretation (pitch → color, tension → movement) → edit ruleset
   - Visual form (particles vs trails vs fields) → edit grammar
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

Phase 0 has a passthrough stabilizer only. Real musical understanding comes from:

- **Chord detection:** Identify chord quality (major, minor, diminished, etc.) from active notes
- **Beat tracking:** Detect tempo and downbeats from timing patterns
- **Phrase boundaries:** Recognize when musical phrases start/end
- **Harmonic analysis:** Calculate tension/resolution over time

Stabilizers enrich `CMSFrame` with derived signals that rulesets can respond to.

#### Rulesets (Musical Interpretation)

Phase 0 ruleset: pitch → hue, velocity → brightness. Directions to explore:

- **Harmonic awareness:** Map chord quality to color temperature, tension to saturation
- **Temporal patterns:** Different responses for sustained notes vs staccato
- **Multi-layered interpretation:** Stack multiple rules (pitch → hue, tension → saturation, rhythm → shape)

Rulesets express a visual analog to the musical meaning identified by the stabilizers. This is where musical ideas become visual parameters.

#### Grammars (Visual Form)

Phase 0 grammar: particle spawning on note events. Directions to explore:

- **Trail grammar:** Particles leave fading paths
- **Field grammar:** Background color shifts with harmony
- **Glyph grammar:** Place symbolic shapes (circles, triangles) based on chord quality
- **Stack grammars:** Layer multiple visual elements

Grammars determine what the visuals *look like*. They receive abstract intents (color, urgency, size) and produce concrete entities.

### Current Constraints (Phase 0)

- **Minimal stabilizers:** Only raw pitch/velocity data. Chord detection and beat tracking need implementation.
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
import type { CMSFrame } from '@synesthetica/contracts/cms';

// Bad - will fail lint
import type { CMSFrame } from '../contracts/cms/frame';
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
