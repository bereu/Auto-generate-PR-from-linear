# What I Learned: Fly.io Deployment Debugging

**Date:** 2026-03-25

## What I Learned This Session

### Dockerfile CMD must match the actual entry point

- The original `CMD` pointed to `src/index.ts` but the NestJS refactor renamed the entry point to `src/main.ts`.
- Fly.io silently starts a process that exits immediately when the wrong file is referenced — no build error, just a crash loop.
- Always double-check the `CMD` in `Dockerfile` matches the current entry point after any refactor.

### `min_machines_running = 1` is required for always-on agents

- Without `min_machines_running = 1`, Fly.io may scale the machine to zero even if `auto_stop_machines = false` is set for HTTP traffic reasons.
- For a background agent (not serving HTTP), explicitly set `min_machines_running = 1` to guarantee the machine is always running.

### Health check endpoint must exist if `[[http_service.checks]]` is defined

- `fly.toml` had a health check pointing to `/health`, but the app had no such route.
- Without the route, Fly treats the machine as unhealthy and restarts it repeatedly.
- Either add a `/health` endpoint in the app or remove the check block from `fly.toml`.

### `DEFAULT_BRANCH` must match the actual repo default branch

- `src/repos.config.ts` had `DEFAULT_BRANCH = "master"` but the target repo uses `main`.
- The agent would try to check out `master`, fail silently, and produce wrong-branch PRs.
- Check `git remote show origin | grep 'HEAD branch'` to confirm the actual default branch before setting this constant.

### `fly secrets set` vs env vars in `fly.toml`

- `LINEAR_WEBHOOK_SECRET` was missing from `fly secrets` even though other secrets were set.
- Secrets set in `fly.toml [env]` are **not** encrypted — use `fly secrets set KEY=VALUE` for anything sensitive.
- Run `fly secrets list` to audit which secrets are actually present before debugging runtime errors.

## What a New Team Member Should Know

- After any refactor that renames or moves the entry point (`src/index.ts` → `src/main.ts`), update `CMD` in `Dockerfile` immediately or the Fly deploy will silently crash-loop.
- `fly logs` (or `fly logs --app bereu-claude-agent`) is the first tool to reach for when a deploy succeeds but the agent isn't processing tickets — it shows the crash reason.
- `fly secrets list` shows key names (not values). If a required env var is missing at runtime, the agent will throw on startup but the error only appears in `fly logs`, not `fly deploy` output.

## Docs & Info That Would Speed Things Up Next Time

- `src/repos.config.ts` — all tuneable constants including `DEFAULT_BRANCH`. Verify this matches the actual repo default branch when adding new repos.
- `fly.toml` — check `min_machines_running`, `auto_stop_machines`, and `[[http_service.checks]]` as a group; they interact and must be consistent with whether the app actually serves HTTP.
- `fly secrets list --app bereu-claude-agent` — run this before deploying to verify all required secrets are present.
