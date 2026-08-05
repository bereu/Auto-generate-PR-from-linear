---
name: use-linear
description: Interact with Linear from the command line via the `linear` CLI (schpet/linear-cli). Use whenever you must list/search/view/create/update Linear issues, projects, or comments — e.g. triage duplicate-detection, creating issues from Slack, or syncing dev progress. Prefer this over any Linear MCP server.
version: 1.0.0
---

## Overview

This project uses the **`linear`** command-line tool ([schpet/linear-cli](https://github.com/schpet/linear-cli)) for all Linear access. We deliberately do **not** use a Linear MCP server (OAuth/token management overhead). Anything you would have done via `mcp__linear__*` tools, do with the `linear` CLI instead.

> Note: the binary is `linear` (not `linear-cli`). This supersedes any older skill that referenced a `linear-cli` binary.

## Prerequisites

- Binary: `linear` (installed via `brew install schpet/tap/linear`; also available via `deno`/`npm`).
- Verify: `linear --version` (expected `2.0.0`+).

## Authentication (one-time, run by the user)

1. Create an API key at `linear.app/settings/account/security` (requires member access, not guest).
2. Authenticate interactively — **do not inline the key on the command line**:
   ```bash
   linear auth login
   ```
3. Manage credentials: `linear auth list`, `linear auth default [workspace]`, `linear auth logout`.

### Project defaults (`.linear.toml` or env vars)

Set a default team so commands don't need `--team` every time. Env vars override the file. Config file locations: `./.linear.toml`, `.config/linear.toml`, `$XDG_CONFIG_HOME/linear/linear.toml`.

```toml
# ./.linear.toml
team_id = "ENG"
workspace = "mycompany"
```

Or run `linear config` inside the repo to set it up interactively.

## Common commands

Add `--json` to `query` (and where supported) for machine-parseable output.

**List / search issues** (duplicate detection, triage)

```bash
linear issue query --search "login bug" --json           # search default team
linear issue query --search "oauth timeout" --team ENG --json
linear issue query --all-teams --json --limit 0          # export everything
linear issue list                                        # table view
linear issue list -s <state> --sort priority
```

**View an issue**

```bash
linear issue view ABC-123          # details
linear issue view ABC-123 -w       # open in browser
linear issue view                  # issue for the current git branch
```

**Create an issue**

```bash
linear issue create -t "Title" -d "Description"
linear issue create -t "Title" -d "Body" --project "My Project" --milestone "Phase 1"
linear issue create                # interactive prompts
```

**Update an issue / comments**

```bash
linear issue update ABC-123 --milestone "Phase 2"
linear issue comment list ABC-123
linear issue comment add ABC-123 -m "Comment text"
```

**Teams / projects / milestones**

```bash
linear team list
linear project list
linear milestone list --project <id>
```

## Guidance

- **Read/query before you create or update.** For triage duplicate-detection, run `linear issue query --search "..." --json` and inspect results before creating a new issue.
- Prefer `--json` when parsing results programmatically.
- Never delete/archive issues unless the task explicitly instructs it (`linear issue delete` is destructive).
- Full command list: `linear --help` and `linear <command> --help`.
