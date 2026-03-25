# What I Learned: Linear-to-Code Agent Implementation

**Date:** 2026-03-24

## What I Learned This Session

### Core Agent Architecture

- The agent uses `@anthropic-ai/claude-agent-sdk` (`query()`) to run Claude Code programmatically in each git worktree — `src/agent.ts:46`
- Setting `options.cwd = wtPath` in the `query()` call causes Claude to automatically load the target repo's `.claude/CLAUDE.md`, skills, and hooks — this is the key mechanism for per-repo customization
- `settingSources: ["project"]` limits config loading to only the project-level `.claude/` directory, avoiding interference from the orchestrator's own settings

### Worktree-Based Parallelism

- Each Linear issue gets its own `git worktree` (created in `src/sync-repos.ts`) so parallel tasks on the same repo don't conflict
- `Promise.allSettled()` is used in `runAgentLoop()` so one failing task doesn't block others — `src/agent.ts:144`
- Worktrees are always cleaned up in `finally` blocks regardless of success/failure — `src/agent.ts:127`

### Linear State Machine

- The agent transitions issues: `Todo → In Progress` before Claude runs, then `In Progress → In Review` on success, and rolls back to `Todo` on failure
- State IDs are hardcoded in `src/repos.config.ts` under `LINEAR_STATES`

### Prompt Template System

- Prompts are loaded from `prompts/task.md` via `src/prompt-loader.ts` with `{{variable}}` substitution
- PR title format: `` `feat: ${issue.title} [${issue.id}]` `` — `src/agent.ts:32`

### oxlint Configuration

- `.oxlintrc.json` + `oxlint.config.js` (two files) are required for oxlint — the JSON holds rule config, the JS file sets the file globs
- `scripts/lint-to-json.sh` converts oxlint output to a structured JSON format for programmatic consumption

### Claude Code Hooks (settings.json)

- Hooks must live under the `"hooks"` top-level key in `settings.json` — placing them at root level is silently ignored (was fixed in commit `8a5f713`)
- The Stop hook uses `async: true` so it doesn't block the main session from closing

## What a New Team Member Should Know

- **`allowedTools` in `query()` is a whitelist** — Claude can only use the exact tools listed. If you add a new capability (e.g., `npm test`), you must add it to `src/agent.ts:54-64`. Forgetting this silently prevents the tool from working.
- **Token usage is logged** but there is no cost cap or circuit breaker — a runaway task will consume tokens freely until `MAX_TURNS` is hit (`src/repos.config.ts`).
- **The worktree directory** is created under `WORKSPACE` (defined in `repos.config.ts`). This path must exist on the machine running the agent, and must have enough disk space for multiple simultaneous checkouts.
- **`GITHUB_TOKEN` must be set** in the environment for `repoUrl()` in `sync-repos.ts:27` to work — clone/push will fail silently otherwise.
- **Linear label filtering** — `fetchAgentIssues()` in `src/linear.ts` filters by a specific label (e.g., `agent`). Issues without that label are ignored entirely regardless of status.
- **The `promptfooconfig.yaml`** is for offline LLM testing of prompt quality — run with `npx promptfoo eval` separately from the main agent.

## Docs & Info That Would Speed Things Up Next Time

- `@anthropic-ai/claude-agent-sdk` SDK docs: the `query()` options shape (especially `settingSources`, `allowedTools`, `maxTurns`) is not obvious without reading the SDK source or docs — checking these upfront avoids trial-and-error.
- `src/repos.config.ts` — all tunable constants live here: `POLL_INTERVAL`, `MAX_TURNS`, `LINEAR_STATES`, `WORKSPACE`, `REPOS`. Read this first before touching any other file.
- `prompts/task.md` — the exact prompt sent to Claude per issue. Understanding this is essential to debugging unexpected agent behavior.
