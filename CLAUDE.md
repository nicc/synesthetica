# Synesthetica

Turns MIDI or audio into real-time visuals that make musical structure legible: three lenses (dynamics, rhythm, harmony) in a browser, operated from a web panel or by an LLM over MCP. Purpose and audience: [VISION.md](VISION.md). User-facing overview: [README.md](README.md).

The principles below constrain every design and implementation decision. A violation must be explicit, intentional and justified.

@PRINCIPLES.md

## Ground rules

- **Propose before building.** For anything non-trivial (new behaviour, multi-file change, refactor), describe what and how, then wait for approval. Trivial fixes and research don't need it.
- **Specs are canonical.** A code change that affects specified behaviour updates the spec in the same commit. If something isn't specified, say so and ask; don't invent scope.
- **Use the glossary.** [GLOSSARY.md](GLOSSARY.md) for project terms, [lens glossary](packages/engine/src/lenses/GLOSSARY.md) for visual elements. Restate loose terms in glossary language, ask when a term is ambiguous, and propose a definition before using a new one.
- **Track work and memory in bd.** No TODO or plan files, and no memory files: persistent notes go in `bd remember --key <slug> "..."`. File discoveries (spec gaps, surprising behaviour) as issues when you find them, then ask the user to triage. `bd close -r "reason"`, not `--comment`.
- **Breaking changes are fine.** No shims, aliases or deprecated paths unless asked.
- **Plain register.** No hype in docs, comments, commits or issues. Be precise about what exists versus what is planned.

## Architecture

```
Source → Adapter → RawInputFrame → Stabilizers (DAG) → MusicalFrame → Visual Vocabulary
       → AnnotatedMusicalFrame → Lenses → SceneFrame → Compositor → Renderer
```

Stabilizers own musical state and analysis. The vocabulary assigns meaning (colour, texture, motion). Lenses decide form and never compute analysis. Rules: [SPEC_008](specs/SPEC_008_pipeline_orchestration.md), [SPEC_006](specs/SPEC_006_vocabulary_and_stabilizer_statefulness.md), [SPEC_003](specs/SPEC_003_instrument_identity_invariants.md).

| Package | Owns | Depends on |
|---|---|---|
| [contracts](packages/contracts/README.md) | All pipeline types and interfaces; the annotation manifest (every macro, session control and concept); primer composer; `pcToHue`; engine-bridge protocol | nothing |
| `adapters` | MIDI, audio (basic-pitch in a worker), computer keyboard → `RawInputFrame` | contracts |
| `engine` | `VisualPipeline`; `stabilizers/`, `vocabularies/`, `lenses/`, `renderers/` (Three.js) | contracts, three, tonal |
| `web-app` | Browser host: input selection, control panel generated from the manifest, render loop | contracts, adapters, engine |
| `cli` | The published `synesthetica` npm package: MCP server (`tools/`, `resources/`), WebSocket bridge to the browser, preset store | contracts, engine |

Start from `packages/contracts` when changing anything that crosses a stage or package boundary.

## Specs and RFCs

- `specs/SPEC_*.md` are canonical: approved decisions that the code must match. `npm run check:specs` verifies their code references resolve; whether the prose still matches behaviour is on you.
- `rfcs/` are exploration and rationale. Read them for why a decision was made. They go stale, may use retired terms, and are never canonical. New designs start as an RFC and become spec text when approved.

| Concern | Specs |
|---|---|
| Pipeline, frames, timing, state | 008 orchestration, 009 frame types, 005 timing, 006 statefulness |
| Meaning and visuals | 003 invariants, 002 pitch-class hue, 010 visual vocabulary, 011 functional harmony |
| Input | 012 polyphonic audio |
| LLM and control | 004 mediation and annotations, 013 MCP control plane, 014 manifest and macro binding, 015 control-op validation |
| Presets, errors | 001 preset storage, 007 diagnostics |

## Where to look

| For | Read |
|---|---|
| Designing or changing a lens (process, snapshots, simulation) | [packages/engine/src/lenses/README.md](packages/engine/src/lenses/README.md) |
| Renderer structure and experiment branches | [packages/engine/src/renderers/README.md](packages/engine/src/renderers/README.md) |
| Tunable constants and their effect | [docs/tunables.md](docs/tunables.md) (reference; the manifest is the macro list) |
| Writing tests | [docs/testing.md](docs/testing.md) |
| Past spikes and findings | [docs/learnings/](docs/learnings/) |
| Visual vocabulary research | [docs/vocabulary/](docs/vocabulary/) |
| Hosted web build | [packages/web-app/DEPLOY.md](packages/web-app/DEPLOY.md) |
| Cutting a release | [RELEASING.md](RELEASING.md) |

## Enforced by the toolchain

Breaking these fails the build or lint, so they need no separate checking. Each ESLint rule block in [eslint.config.mjs](eslint.config.mjs) names the principle it encodes.

- **Compiler** (`tsconfig.base.json`): strict, `exactOptionalPropertyTypes`, no unused locals/parameters, `verbatimModuleSyntax`, `noImplicitOverride`, `noImplicitReturns`.
- **Layer boundaries** (SPEC_008): engine layers don't import layers they don't consume; stabilizers and vocabularies don't import `three`; lenses and renderers don't import `tonal`; lenses don't import `pcToHue` (I14).
- **Determinism**: no `Math.random`, `Date.now`, `performance.now` or browser globals in stabilizers, vocabularies or lenses.
- **Package discipline**: contracts imports no other package; adapters don't depend on engine; no imports of another package's `src/` or `dist/`.
- **Code hygiene**: no deprecated APIs, exhaustive switches over unions, no floating promises.
- **Tests**: no `.only`/`.skip`, every test asserts, no `console`.
- **Specs**: `check:specs` fails on spec references to missing paths or types and on retired terms (grammar, ruleset).
- **Manifest**: the contracts build validates the manifest (ids, ranges, `consumers[]`; SPEC_014).

Lint exemptions are `eslint-disable-next-line` comments that give the reason and cite the bd issue that removes them.

## Tests

The full rules are in [docs/testing.md](docs/testing.md). The core rule: a test protects a behaviour. It survives a retune of a default and fails when the behaviour breaks. So import tunables rather than retyping them, assert properties (orderings, bounds, ratios) over values, and check defaults only in `wiringCoverage.test.ts`.

## Finishing work

```bash
npm run build && npm run typecheck && npm test && npm run lint
```

- Work on a branch, never on `main`. Commit at stopping points; lead commit messages with the product change.
- When the work is ready, push the branch and open a PR with `gh pr create`. CI runs the same gates. The user reviews and merges.
- `bd sync` pushes the issue database (a Dolt remote, independent of git branches).
- After a rename, grep for the old term across `.ts` and `.md` before calling it done.
