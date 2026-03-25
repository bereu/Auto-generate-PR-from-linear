# What I Learned: GitHub SSH Remote Switch and gh CLI Token Conflict

**Date:** 2026-03-25

## What I Learned This Session

### 1. Clone with HTTPS then switch remote to SSH immediately

`syncRepo()` in `src/sync-repos.ts` clones with an HTTPS URL (so it works in CI with `GITHUB_TOKEN`):

```ts
git(`clone --branch ${branch} ${repoUrl(org, name)} ${dest}`, WORKSPACE);
```

Then immediately switches the remote to SSH:

```ts
git(`remote set-url origin ${repoSshUrl(org, name)}`, dest); // line 68
```

**Why:** `gh` CLI manages its own auth via `~/.config/gh/hosts.yml` and SSH keys. If the remote stays as `https://x-access-token:TOKEN@github.com/...`, subsequent `git push` and `gh pr create` calls issued by the Claude sub-agent conflict with the PAT embedded in the URL. Switching to SSH after clone makes all later operations use the SSH key instead, which is consistent with how `gh` expects to operate locally.

This two-step pattern (HTTPS clone → SSH remote set) is the correct approach when you need both:

- A token-authenticated clone (for CI / fresh environments)
- SSH-based push/PR for subsequent operations

### 2. Sub-agent must unset GITHUB_TOKEN when calling `gh pr create`

The instruction in `prompts/task.md` tells the Claude sub-agent to run:

```bash
env -u GITHUB_TOKEN gh pr create ...
```

**Why:** The parent process exports `GITHUB_TOKEN` (used for Linear API calls and HTTPS clone). When `gh` sees `GITHUB_TOKEN` in the environment, it tries to use it as its auth token. But the PAT may lack the scopes `gh` needs, or conflict with the SSH-based auth configured in `~/.config/gh/hosts.yml`. Unsetting `GITHUB_TOKEN` for `gh` calls lets `gh` fall back to its own credential store and SSH key, which works correctly.

This must be in the **prompt**, not in the agent process's environment, because the sub-agent issues shell commands itself — it cannot modify its own inherited environment setup.

### 3. `WORKSPACE` path must be set in `.env` before startup

`repos.config.ts` reads:

```ts
export const WORKSPACE = process.env.WORKSPACE ?? "/workspace";
```

The default `/workspace` is the Docker container path. For local dev, add to `.env`:

```
WORKSPACE=/Users/<you>/sandbox/workspace
```

If this is missing, the agent clones repos into `/workspace` (which likely doesn't exist locally), and all worktree operations fail silently or throw ENOENT.

## What a New Team Member Should Know

- After `syncRepo()` runs, the remote URL is SSH (`git@github.com:...`), not HTTPS. This is intentional. Do not change it back.
- Any shell command the sub-agent runs that touches `gh` should use `env -u GITHUB_TOKEN gh ...` to avoid the PAT conflict. This is documented in `prompts/task.md`.
- Before running locally, confirm `.env` has `WORKSPACE` pointing to a writable directory. The workspace directory is created automatically (`fs.mkdirSync(WORKSPACE, { recursive: true })`), but the parent must be writable.

## Docs & Info That Would Speed Things Up Next Time

- `src/sync-repos.ts` lines 59–68 — the two-step HTTPS clone → SSH remote pattern.
- `prompts/task.md` — contains the `env -u GITHUB_TOKEN` instruction and explains the full PR creation flow given to the sub-agent.
- `gh` CLI docs on environment variables — `GITHUB_TOKEN` overrides `gh`'s auth; `GH_TOKEN` is the preferred way to pass a token to `gh` if needed.
