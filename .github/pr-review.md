# PR review brief

You are reviewing a pull request to Synesthetica, independently of the session that wrote it. CLAUDE.md (which imports PRINCIPLES.md) is already in your context; read it first. The PR branch is checked out.

Your context is the repo and the PR (`gh pr view`, `gh pr diff`). You have no access to the conversation that produced the change or to the issue tracker, so the PR description is how the author tells you what was intended and what was decided.

Your findings are advisory: post comments only, and never approve or request changes. The user decides what to act on.

## What not to review

CI already runs build, typecheck, tests, ESLint (layer boundaries, determinism, package discipline, test hygiene) and `check:specs`. Don't comment on anything those catch, or on formatting.

## What to check

Read the description, then the diff, then the specs, glossary entries and surrounding code the diff touches.

1. **The description.** It should state intent, behaviour changes, pertinent specs and RFCs, and decisions and deliberate exceptions (see `.github/pull_request_template.md`). Flag a missing or empty section. Check its claims against the diff: a PR described as having no behaviour change that changes behaviour is a finding, and so is a spec it says it implements that the code contradicts. An exception the description acknowledges and justifies is not a finding unless the justification is wrong.
2. **Principles.** For each principle in PRINCIPLES.md, ask whether the change violates it without saying so. The ones most often at stake:
   - §4 Perceptual honesty: does it infer intent or judge correctness or quality, or does the visual claim more than was measured?
   - §9 Observation over synthesis: does it add a computed summary where direct observation would do, and if so, does it meet one of the three conditions that justify synthesis?
   - §3 Emergent power from primitives: does it add a feature that existing primitives could express?
   - §5 Real-time respect: is there unbounded work or growth in the per-frame path (caches without bounds or pruning)?
   - §8: does an RFC or spec in the diff make a checkable quantitative claim that nobody computed?
3. **Separation of meaning and form, and where state lives** (SPEC_003, SPEC_006). Lint can't catch these: a lens computing musical analysis, musical state held outside stabilizers, an impure vocabulary, meaning (colour semantics) decided in a lens.
4. **Spec parity.** If specified behaviour changed, did the spec change in this PR? Does a new concept need a spec? Does the PR do more than the spec and the description say?
5. **Architectural soundness.**
   - Data flows one way through the pipeline (SPEC_008); no stage reaches upstream or sideways for data.
   - A contracts change is carried through every consumer, and the type models the states that exist (no optional field standing in for an unmodelled state).
   - No new coupling across domains (audio, MIDI, visuals), or between the CLI and the engine beyond the bridge protocol (§6).
   - A new abstraction has more than one current use (§2).
   - New state has one owner, a bound, and a disposal path.
6. **Code quality.** Report only findings with a concrete consequence:
   - Correctness: give the input or state that produces the wrong result.
   - Simplification: name the simpler form, rather than calling the code complex.
   - Duplication: name the existing helper it duplicates.
   - Project conventions: the Code conventions section of CLAUDE.md.

   No style preferences, naming debates, or performance concerns without a hot-path reason.
7. **Glossary.** Terms used consistently with GLOSSARY.md and the lens glossary; new terms defined there; no retired terms (grammar, ruleset).
8. **Tests**, against docs/testing.md: retyped tunables, pinned default values, tests that can't fail, timing offsets not derived from config.
9. **Shims and compatibility layers** added without a stated need.
10. **Manifest wiring.** A new or changed macro has its consumers, a derived-state field if its meaning depends on session state, and matching primer text (CLAUDE.md, Code conventions).

## How to report

- Inline comments (`mcp__github_inline_comment__create_inline_comment`, `confirmed: true`) for findings tied to a line.
- One top-level comment (`gh pr comment`) listing all findings ranked by severity, at most ten; if there are more, keep the most severe and say how many you dropped. For each: the principle, spec or rule it concerns; what the code does (observation); why that conflicts (interpretation, marked as such); and your confidence. Say which ones you would act on.
- If nothing survives scrutiny, say "No findings" and list what you checked. Don't pad, praise or summarise the PR back.
- If you have already commented on this PR, review only what changed since then and don't repeat findings that are still open.

Register: plain and specific, no hype.
