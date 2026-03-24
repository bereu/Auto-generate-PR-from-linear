# What I Learned: Stop Hook Setup and Fly.io Deployment

**Date:** 2026-03-24

## What I Learned This Session

### Stop Hook Configuration

- The Stop hook in `.claude/settings.json` must be nested under `"hooks": { "Stop": [...] }`, not at the top level as `"Stop": [...]`.
- The hook type must be `"command"` (not `"prompt"`) to invoke a sub-Claude process. A working pattern:
  ```json
  "Stop": [
    {
      "matcher": "",
      "hooks": [
        {
          "type": "command",
          "command": "cd /Users/soheieto/sandbox/auto-generate-code-from-linear && /Users/soheieto/.claude/local/claude --permission-mode acceptEdits -p 'use what-i-learned skills. And report your learning' --output-format text 2>/dev/null || true"
        }
      ]
    }
  ]
  ```
- The `Write(docs/learned/*)` permission must be explicitly added to `.claude/settings.json` `allow` list, otherwise the sub-Claude invoked by the Stop hook cannot write files.

### Fly.io Deployment

- App name: `bereu-claude-agent`, deployed to region `nrt` (Tokyo).
- `fly.toml` uses `auto_stop_machines = false` to keep the agent always running (background process, no HTTP traffic).
- A persistent volume `repos_workspace` is mounted at `/app/workspace` so cloned repos survive machine restarts.
- The Dockerfile installs `gh` CLI via the official GitHub APT repository — needed for `gh pr create` inside the agent.
- Deploy command: `fly deploy` (requires `flyctl` installed and authenticated).
- Required secrets must be set via `fly secrets set GITHUB_TOKEN=... LINEAR_API_KEY=... ANTHROPIC_API_KEY=...` before first deploy.

### Agent Architecture

- `src/index.ts` → validates env vars → `syncAllRepos()` → `runAgentLoop()`
- `runAgentLoop()` polls Linear every `POLL_INTERVAL` (1 min in `repos.config.ts`) for issues with label `"agent"` in state `"Todo"`.
- Each issue is processed in a git worktree for isolation; parallel execution via `Promise.allSettled`.
- `@anthropic-ai/claude-agent-sdk`'s `query()` is called with `settingSources: ["project"]` so the target repo's `.claude/` config is loaded automatically.

## What a New Team Member Should Know

- The `PostToolUse` hook runs `npm run lint` after every file edit. If lint fails, the edit is blocked. Don't add trailing commas or unused imports — oxlint is strict.
- `POLL_INTERVAL` is set to 60 seconds (`repos.config.ts:10`). In production on Fly.io this means the agent checks for new Linear tickets every minute.
- The `resolveRepo()` function in `src/linear.ts` strips the `harness-` prefix from repo names to match a Linear issue to a repo config entry — if you add repos, they must follow the same naming pattern or update `REPO_NAME_PREFIX`.
- `docs/tasks/complete/` holds all completed task specs — check here before starting new work to avoid duplicating a task that was already done.
- The `what-i-learned` Stop hook runs a sub-Claude process when the main session ends. It requires the `Write(docs/learned/*)` permission in `.claude/settings.json` or writes will be denied.

## Docs & Info That Would Speed Things Up Next Time

- `fly.toml` comments (in Japanese) explain the `auto_stop_machines = false` choice and why `http_service` is defined but effectively unused — read these before changing the Fly config.
- `src/repos.config.ts` is the single source of truth for all tuneable constants (poll interval, max turns, log truncation, branch prefix, Linear state names). Check here before searching for magic strings.
- The `@anthropic-ai/claude-agent-sdk` `settingSources: ["project"]` option is what makes the agent inherit the target repo's `.claude/CLAUDE.md` and skills — if this is removed, the agent loses all repo-specific context.
