# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.

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
2. **Run quality gates** (if code changed) - Tests, linters, builds
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
