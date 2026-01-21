# bd (beads) Quick Reference

## Discovery
```bash
bd ready                    # Find available work
bd show <id>                # View issue details
bd list                     # List all issues
```

## Status changes
```bash
bd update <id> --status in_progress   # Claim work
bd close <id>                         # Complete work
bd close <id> -r "reason"             # Complete with reason (use -r, not --comment)
```

## Creation
```bash
bd create --title="..." --type=task --priority=2   # Create issue
bd create --title="..." --body="..."               # With description
```

## Dependencies
```bash
bd dep add <id> <depends-on-id>       # Add dependency (NOT "bd dep <id> <id>")
bd dep remove <id> <depends-on-id>    # Remove dependency
```

## Sync
```bash
bd sync                     # Sync with git
```

## Common mistakes to avoid
- `bd close --comment "..."` → use `-r "..."` instead
- `bd dep <id1> <id2>` → use `bd dep add <id1> <id2>`
- Never edit `.beads/issues.jsonl` directly — always use the CLI
