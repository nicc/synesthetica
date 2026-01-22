# Agent Instructions

**Read `PRINCIPLES.md` at session start.** It defines constraints that apply to all design and implementation decisions.

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started. See [docs/bd-quickref.md](docs/bd-quickref.md) for command reference.

## Contents

1. [Implementation Approval](#implementation-approval)
2. [Communication Style](#communication-style)
3. [Scope and Substantiation](#scope-and-substantiation)
4. [Landing the Plane](#landing-the-plane-session-completion)
5. [Task Tracking](#task-tracking)
6. [Discovery Capture](#discovery-capture-during-implementation)
7. [Session Synthesis](#session-synthesis-end-of-session)
8. [Feedback for the User](#feedback-for-the-user)
9. [Linting](#linting)
10. [Testing Conventions](#testing-conventions)
11. [Spec Maintenance](#spec-maintenance)
12. [Context Awareness](#context-awareness-before-action)
13. [Verification After Changes](#verification-after-changes)
14. [Commit Messages](#commit-messages)

---

## Implementation Approval

**Always check with the user before starting implementation work.**

Before writing code for any non-trivial task:
1. Explain what you intend to build
2. Describe the approach (what files, what changes, what trade-offs)
3. Wait for approval before proceeding

This applies to:
- New features or components
- Architectural changes (e.g., adding stabilizer DAG support)
- Significant refactors
- Anything that touches multiple files

It does NOT apply to:
- Trivial fixes (typos, obvious bugs)
- Research and exploration (reading files, understanding code)
- Questions and clarifications

**Why:** The user wants visibility into approach before investment. Course-correcting after code is written wastes effort.

## Communication Style

**Use simple, direct language. Do not hype.**

- Avoid marketing language, superlatives, or enthusiasm ("exciting", "powerful", "amazing")
- Avoid unnecessary hedging ("should", "might", "could") when stating facts
- Be precise about what exists vs what's planned
- State limitations plainly without apology
- Write as if documenting, not selling

**Examples:**

Bad: "This exciting new feature enables powerful real-time visualizations!"
Good: "Converts MIDI input to visual output in real-time."

Bad: "The innovative ruleset system provides amazing flexibility!"
Good: "Rulesets map musical events to visual parameters."

Bad: "Our architecture should make it easy to add new grammars."
Good: "The grammar interface allows adding new visual styles."

**This applies to:**
- All documentation, commit messages, code comments, issue descriptions
- Conversation with collaborators during development
- Design proposals and technical discussion

## Scope and Substantiation

**Only document or implement what is substantiated by existing project documents.**

When writing documentation or discussing features:
- Reference existing specs, RFCs, or contract definitions
- If something isn't documented, say "this isn't specified yet" rather than inventing details
- Do not extrapolate features or interfaces beyond what's written
- If you grasp the intent, use that intuition to ask clarifying questions, not to invent scope

**Examples:**

Bad: Adding query methods like `get_parts()` or `get_active_intents()` without finding them in specs
Good: "I don't see query interfaces defined. Should I look in a different spec, or is this planned but not yet documented?"

Bad: Describing detailed LLM interaction flows not in the specs
Good: "SPEC_004 defines annotations and control ops. The query interface isn't specified yet."

**When you discover a gap:**
1. Note it explicitly ("This isn't specified yet")
2. Ask if it should be added or if you missed something
3. Only proceed with invention if explicitly asked to design something new

This ensures documentation reflects actual project state, not assumptions.

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed):
   ```bash
   npm run lint        # Linting
   npm test -ws        # Tests
   npm run build -ws   # Build
   ```
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

## Task Tracking

**Always use `bd` (beads) for tracking work items.** Never use TODO.md, PLAN.md, or other ad-hoc files.

- Deferred work → `bd create --title="..." --type=task`
- Design decisions → document in specs/RFCs, reference from issues
- Implementation tasks → `bd create` with clear descriptions

**Never create plan documents (PLAN.md, TODO.md, etc.).** They go stale quickly and create redundancy with beads issues, RFCs, and specs. Instead:
- For architectural changes → write a spec
- For design exploration → write an RFC (can be implementation-specific)
- For task tracking → use beads issues
- For implementation approval → describe the approach in conversation, then implement

**Assume breaking changes are fine.** At this early stage, prefer clean interfaces over migration paths. Only add backward compatibility if the need is explicitly identified. Don't add deprecated aliases, shims, or compatibility layers unless asked.

This ensures work survives session boundaries and context compaction.

## Discovery Capture (During Implementation)

**Persist discoveries by default.** When you learn something during implementation — a spec gap, a surprising behavior, an assumption violation, a new requirement — capture it immediately as a beads issue.

**Workflow:**
1. **Discover something** — e.g., "Web MIDI events arrive in batches, not one-at-a-time"
2. **Create an issue immediately** — `bd create --title="DISCOVERY: MIDI events batch" --type=task --priority=4`
3. **Ask user to triage** — "I discovered X. I've filed it as synesthetica-xxx (P4). Should we: (a) keep for later, (b) address now, (c) discard as not relevant?"

**Why persist by default:**
- Context is lost at session end — discoveries that aren't written down disappear
- You don't always know what's important; the user can triage
- It's easier to discard an issue than to remember a lost insight
- Explicitly choosing to discard is better than implicitly forgetting

**Escape hatch:** If the user says "discard" or "not relevant", delete the issue with `bd delete <id>`.

## Session Synthesis (End of Session)

**Before closing out, synthesize what was learned.** This is separate from the persistence workflow above — those capture in-the-moment discoveries, this step reflects on the session as a whole.

**At session end, provide:**
1. **What we validated** — assumptions that were confirmed
2. **What we invalidated** — assumptions that were wrong
3. **What surprised us** — unexpected behaviors or requirements
4. **What remains unknown** — questions we didn't answer
5. **Spec amendments needed** — concrete changes to specs/contracts

This synthesis should be a brief summary in your handoff message. If significant, it may warrant a dedicated document (e.g., `docs/learnings/2026-01-17-midi-spike.md`).

## Feedback for the User

**Provide feedback automatically at natural stopping points and before context compaction.**

The user wants to improve their collaboration patterns. Don't wait to be asked — proactively offer observations at these moments:

**When to provide feedback:**
- After a commit (natural stopping point)
- When the user says "let's pause", "let's stop there", or similar
- Before context compaction (you'll lose this opportunity otherwise)
- At the end of a significant feature or task

**What to include:**
1. **What went well** — effective patterns, good decisions, productive approaches
2. **What could improve** — friction points, repeated issues, communication gaps
3. **Suggestions** — specific, actionable changes for future sessions
4. **Patterns noticed** — recurring themes across the work

**Tone:** Direct, constructive, specific. Not effusive praise. The goal is genuine improvement, not validation.

**Example:**
```
Feedback on this session:

What went well:
- Catching the asymptotic smoothing bug showed good attention to edge cases
- Asking for literature review instead of continuing ad-hoc approaches was effective

What could improve:
- Initial tempo detection had several iterations that could have been avoided
  with upfront research

Suggestion:
- For algorithm-heavy features, consider starting with a literature review
  before implementing
```

**Why this matters:** Feedback at compaction time is the last chance to capture insights before context is lost. The user can't improve patterns they don't know about.

## Linting

**Run `npm run lint` before committing.** This is part of the quality gates in the landing-the-plane checklist.

**Commands:**
```bash
npm run lint        # Check for issues
npm run lint:fix    # Auto-fix where possible
```

**Key rules enforced:**
- **Contracts discipline**: All types come from `@synesthetica/contracts`, not internal paths
- **Type-only imports**: Use `import type { ... }` for types (enforced by `consistent-type-imports`)
- **No unused vars**: Except those prefixed with `_` (convention for intentionally unused)
- **No debugger statements**: Remove before commit

**If lint fails:** Fix the issues before pushing. Most are auto-fixable with `npm run lint:fix`.

## Testing Conventions

**Test runner:** vitest (fast, native ESM, minimal config)

**Principles:**
- Use dependency injection to decouple from browser APIs (Web MIDI, Web Audio, Canvas)
- Test transformation logic with mocks, not browser environments
- Keep tests fast — if it needs a browser, it's probably an integration test

**Current patterns:**
- `MidiSource` interface allows testing `MidiAdapter` without Web MIDI API
- Tests live in `packages/<pkg>/test/` mirroring `src/` structure
- Run with `npm test` (per-package) or `npm test -ws` (all packages)

**What we don't have yet:**
- Golden tests for visual output (planned: synesthetica-901)
- Integration tests across pipeline components
- Browser-based end-to-end tests

**Grammar development:** See [packages/engine/src/grammars/README.md](packages/engine/src/grammars/README.md) for the incremental development approach using ASCII diagrams, SVG snapshots, and simulation metrics.

This section will evolve as we learn what works.

## Spec Maintenance

**Specs are canonical. Code and specs must always match.**

RFCs are for discovery and exploration. Specs are the source of truth. When you change code that relates to a spec, you MUST update the spec in the same session.

**Rules:**

1. **Read specs at session start** — Before making significant changes, read relevant specs in `specs/` to understand the current architecture
2. **Update specs with code** — If you modify behavior covered by a spec, update the spec immediately (not "later")
3. **Create specs for new concepts** — If you introduce new architectural concepts not covered by existing specs, create a new spec
4. **Never leave specs stale** — A session is not complete if specs don't match the code you changed

**When changing code, ask yourself:**
- Does this change contradict any spec? → Update the spec
- Does this change implement something a spec describes differently? → Update the spec
- Does this introduce a new pattern or concept? → Consider a new spec
- Does this remove functionality a spec describes? → Update or retire the spec

**Spec locations:**
- `specs/SPEC_*.md` — Approved architectural decisions
- `specs/RFC_*.md` — Discovery documents (may be outdated, not canonical)

**Example workflow:**
```
1. Read SPEC_008 (pipeline orchestration)
2. Implement new stabilizer interface
3. Update SPEC_008 to reflect new interface
4. Update SPEC_006 if stabilizer statefulness changed
5. Run tests, commit code AND spec changes together
```

**Why this matters:**
- Future sessions start by reading specs to build context
- Stale specs cause incorrect implementations
- Specs are how humans and agents understand the system
- The cost of updating a spec now is tiny; the cost of debugging a stale spec later is large

## Context Awareness Before Action

**Understand the space before modifying it.** Before making structural changes (renaming, moving, refactoring), gather context about the surrounding environment.

**Before renaming or moving files:**
```bash
ls <parent-directory>           # What else is here?
grep -r "<term>" --include="*.ts" --include="*.md"  # Where is this used?
```

**Before modifying types or interfaces:**
- Read the file you're modifying
- Check what imports it
- Check what it imports
- Understand the naming conventions in the surrounding code

**Why this matters:**
- Renaming `cms/` to `music/` when `musical/` already exists creates confusion
- Moving code without understanding imports breaks builds
- Naming decisions affect discoverability and understanding

**Examples of context-gathering:**
- "Let me check what folders exist in contracts before renaming"
- "Let me see what imports this type before changing it"
- "Let me understand the naming pattern used elsewhere"

## Verification After Changes

**Prove completeness before declaring done.** After making changes, systematically verify nothing was missed.

**After terminology changes (renames, migrations):**
```bash
grep -ri "<old-term>" --include="*.ts" --include="*.md"  # Find ALL remaining uses
ls <affected-directory>                                   # Verify structure is clean
```

**After documentation updates:**
- List all markdown files that might reference the changed concept
- Search for the old terminology across all docs
- Check folder names match documented names

**Verification checklist template:**
```
1. Code compiles: npm run build -ws
2. Tests pass: npm test -ws
3. Lint passes: npm run lint
4. No stale references: grep -ri "<old-term>" --include="*.ts" --include="*.md"
5. Folder structure makes sense: ls <affected-directories>
6. Docs match code: compare README/glossary terms to actual folder names
```

**The goal:** A future session should find zero traces of stale terminology and a coherent structure.

## Commit Messages

**Summarize product work in commit messages.** The git log is a project history — don't hide important work behind "bd sync".

When committing beads changes, describe what was accomplished:

```bash
# BAD - hides the work
git commit -m "bd sync"

# GOOD - describes the product work
git commit -m "Add design gap issues for Phase 1 blockers

- Macro-to-grammar parameter binding (synesthetica-1wq)
- Coordinate system conventions (synesthetica-khj)
- 6 more spec gaps identified and tracked"
```

For mixed commits (code + issues), lead with the code change and mention issue work:

```bash
git commit -m "Add pcToHue function to contracts

Also created issues for derived signals schema and stabilizer ordering."
```

If you are resuming from compaction, re-read this file before proceeding.