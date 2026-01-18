# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

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

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

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

**Always use `bd` (beads) for tracking work items.** Never use TODO.md or other ad-hoc files.

- Deferred work → `bd create --title="..." --type=task`
- Design decisions → document in specs/RFCs, reference from issues
- Implementation tasks → `bd create` with clear descriptions

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

This section will evolve as we learn what works.

## Commit Messages

**Summarize product work in commit messages.** The git log is a project history — don't hide important work behind "bd sync".

When committing beads changes, describe what was accomplished:

```bash
# BAD - hides the work
git commit -m "bd sync"

# GOOD - describes the product work
git commit -m "Add design gap issues for Phase 1 blockers

- Macro-to-grammar parameter binding (synesthetica-1wq)
- Entity lifecycle and decay semantics (synesthetica-ray)
- Coordinate system conventions (synesthetica-khj)
- 8 more spec gaps identified and tracked"
```

For mixed commits (code + issues), lead with the code change and mention issue work:

```bash
git commit -m "Add pcToHue function to contracts

Also created issues for derived signals schema and stabilizer ordering."
```
