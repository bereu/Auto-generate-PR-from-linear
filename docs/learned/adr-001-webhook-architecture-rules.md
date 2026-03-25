# What I Learned: ADR-001 Webhook Architecture Rules

**Date:** 2026-03-25

## What I Learned This Session

### `env -u GITHUB_TOKEN gh pr create` is required

When `GITHUB_TOKEN` is set in the environment (e.g. from Fly.io secrets), the `gh` CLI prefers it over SSH key auth. This breaks `gh pr create` when the repo requires SSH. The fix is to unset `GITHUB_TOKEN` specifically for the `gh` call:

```bash
env -u GITHUB_TOKEN gh pr create --fill
```

Without this, PRs fail silently or with auth errors even though SSH push succeeds.

### Layer responsibility is strictly enforced

The system has 5 layers with hard boundaries — violating them causes hard-to-trace bugs:

| Layer               | What it does                        | What it must NOT do  |
| ------------------- | ----------------------------------- | -------------------- |
| `WebhookController` | Receives HTTP, validates HMAC       | Business logic       |
| `WebhookService`    | Filters payload, fires processIssue | Git, Linear API      |
| `agent.ts`          | Linear state + worktree lifecycle   | Direct DB/FS access  |
| `sync-repos.ts`     | Git operations only                 | Linear or Claude SDK |
| `linear.ts`         | Linear API only                     | Git, filesystem      |

### Webhook handler must respond immediately (fire-and-forget)

The webhook HTTP response must return `200` before the agent starts. Linear times out if the response takes too long. `processIssue()` is called without `await`:

```ts
this.webhookService.processIssue(issue); // no await
res.status(200).send();
```

Awaiting it would block the response until the entire agent run completes (potentially hours).

### Worktree cleanup must be in `finally`

If the agent throws mid-run, the worktree would remain on disk forever. Always:

```ts
try {
  await runAgent(worktreePath);
} finally {
  await cleanupWorktree(worktreePath);
}
```

## What a New Team Member Should Know

- The ADR at `docs/adr/ADR-001-webhook-driven-agent-architecture.md` is the authoritative spec. Read it before modifying any of the 5 layers.
- `processIssue` must only be called from `WebhookService`. Calling it from anywhere else breaks the linear state machine.
- Issue processing only triggers when: type=`Issue`, label=`agent`, state=`Todo`. Changing one of these (e.g. renaming the Linear label) silently stops all automation.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/ADR-001-webhook-driven-agent-architecture.md` — read the Access Rules and Do's/Don'ts sections before touching any of the 5 layers.
- `src/repos.config.ts` — `LINEAR_LABEL` is the trigger label name; `MAX_TURNS` controls suspension.
