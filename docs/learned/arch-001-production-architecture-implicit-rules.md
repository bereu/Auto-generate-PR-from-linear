# What I Learned: ARCH-001 Production Architecture Implicit Rules

**Date:** 2026-03-27

## What I Learned This Session

This session produced **ARCH-001** — the production architecture ADR for the Slack bug triage to automated PR pipeline. Several constraints were encoded in the ADR that are non-obvious and not inferrable from the code alone.

### 1. Linear state update to "In Progress" is an idempotency lock, not just a status display

Setting the Linear issue state to `In Progress` **before** calling `query()` is the mechanism that prevents duplicate agent runs. If a second webhook arrives for the same issue (e.g., a retry from Linear) while Claude is already running, the state check (`state == Todo`) will fail and the second invocation is dropped.

The rule: state must be updated **atomically before** any agent work starts. Updating it after is a race condition that allows duplicate agents to run on the same issue.

This constraint is in ARCH-001 but absent from the existing code comments and ADR-001.

### 2. Slack Events API requires HTTP response within 3 seconds — this is why fire-and-forget is mandatory

Slack will retry the webhook if the server doesn't respond within 3 seconds. Long-running operations (git clone, worktree setup, Claude invocation) must not block the HTTP response. The correct pattern is:

1. Respond `200 OK` immediately
2. Trigger the async pipeline in the background (no await on the controller)

This is already applied in the NestJS webhook controller (`nestjs-raw-body-webhook-implementation.md`), but the **reason** — the 3-second hard deadline — was only explicitly documented in ARCH-001. Developers unfamiliar with Slack's Events API may not know why `await` on the controller handler is wrong.

### 3. Worktree cleanup must be in a `finally` block — not just on success

The rule: `cleanupWorktree()` must execute regardless of whether Claude succeeds, errors, or hits MAX_TURNS. Putting cleanup only in the success path leaves stale worktrees on the fly.io volume, which has a fixed size. Accumulated stale worktrees will eventually fill the disk and break all future runs silently (no disk-full error is surfaced in Linear state).

### 4. Branch naming convention: `claude/issue-<issueId>`

Branches created by the agent must follow the `claude/issue-<issueId>` naming pattern. This is not currently enforced in code — it's a convention documented in ARCH-001. Deviating from this breaks the PR-to-Linear linkback, since the issue URL in the PR body is derived from the branch name.

### 5. archgate ADRs use `ARCH-` prefix, legacy ADRs use `ADR-` prefix — both coexist

The project originally used `ADR-001` naming (in `docs/adr/`). After adopting archgate, new ADRs use the `ARCH-` prefix (e.g., `ARCH-001`). Both naming schemes now coexist in `docs/adr/`. There is no migration of old ADRs to the new scheme — they remain as-is.

When referencing ADRs: `ADR-001` = original hand-written ADR; `ARCH-NNN` = archgate-managed ADR.

### 6. `rules: false` in archgate frontmatter means "document only, not enforced"

The `ARCH-001` ADR was created with `rules: false` in the frontmatter. This means archgate will not run lint checks against these rules during `archgate check`. If you want archgate to enforce a constraint automatically (e.g., block commits that violate the rule), set `rules: true`. `rules: false` is appropriate for architecture decisions that are too contextual for automated enforcement.

## What a New Team Member Should Know

- The Linear state update is an idempotency guard. Change the order (update state after Claude) and you introduce duplicate-agent bugs that are hard to reproduce.
- The Slack 3-second constraint is why every operation after webhook receipt must be async and non-blocking. Do not add `await` to the webhook controller handler.
- Always clean up worktrees in `finally`. The fly.io volume is bounded. Stale worktrees are invisible until the disk fills.
- `docs/adr/` contains two naming schemes: `ADR-NNN` (legacy) and `ARCH-NNN` (archgate). Both are valid; no migration needed.
- `ARCH-001` (`.archgate/adrs/ARCH-001-*.md`) is the canonical production architecture reference. Read it before making changes to the Slack intake flow, Linear state machine, or Claude invocation.

## Docs & Info That Would Speed Things Up Next Time

- `ARCH-001`: `.archgate/adrs/ARCH-001-production-architecture-slack-bug-triage-to-automated-pr.md` — primary architecture reference.
- `src/repos.config.ts` — all tunable constants including `MAX_TURNS`, `LINEAR_STATES`, workspace path.
- Slack Events API docs: the 3-second response requirement is in the "Responding to events" section.
- Previous archgate setup: `docs/learned/archgate-symlink-docs-adr-reconciliation.md`.
