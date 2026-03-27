# What I Learned: Operational Gotchas Not Yet in Any ADR

**Date:** 2026-03-25

## What I Learned This Session

This session reviewed existing learned docs and identified which operational facts are **not captured in ADR-001** and would surprise a new contributor.

### 1. Sub-agent `allowedTools` excludes `Edit`

`src/agent.ts` passes an explicit `allowedTools` list to the Claude Agent SDK. `Edit` is **not included** — the sub-agent can only use `Read` and `Write` for file modifications. If the target repo's CLAUDE.md or prompt tells Claude to use `Edit`, those calls are silently rejected. Not in ADR-001.

See: `src/agent.ts` lines 57–67.

### 2. `settingSources: ["project"]` loads the TARGET repo's `.claude/`, not the agent server's

With `cwd: wtPath` and `settingSources: ["project"]`, the sub-agent reads the **target repo's** CLAUDE.md, skills, and hooks — not the `auto-generate-code-from-linear` server's own config. Behavior is therefore controlled by what's in the target repo. Not in ADR-001.

### 3. Linear statuses are team-scoped and must be created per team

Every status in `LINEAR_STATES` (e.g., `"Suspended"`) must be manually created in **each Linear team** that will be targeted. Creating it in one team does not make it available in others. The name must match exactly (case-sensitive). Missing statuses throw at runtime — not at startup. Not in ADR-001.

See: `src/linear.ts` `updateIssueState()` and `src/repos.config.ts`.

### 4. Claude Agent SDK signals max-turns via `result.subtype`, not an exception

When `maxTurns` is reached, the SDK resolves normally (does not throw) with `result.subtype === "error_max_turns"`. Checking only `result.type` silently treats max-turns as success. Not in ADR-001.

See: `src/agent.ts` lines 89–95.

### 5. `WORKSPACE` default is a Docker path — local dev requires `.env` override

`repos.config.ts` defaults `WORKSPACE` to `/workspace` (Docker container path). For local dev, `.env` must contain:

```
WORKSPACE=/Users/<you>/sandbox/workspace
```

Missing this causes all worktree operations to fail with ENOENT — no startup-time warning. Not in ADR-001.

### 6. ADR files in `docs/adr/` must be ≤100 lines

An unstated team rule: no ADR should exceed 100 lines. There is no linter or CI check enforcing this — it is a manual convention.

## What a New Team Member Should Know

- ADR-001 covers the 5-layer access rules, fire-and-forget response, and worktree cleanup. Everything listed above is **outside ADR-001** and therefore easy to miss.
- Before creating a new ADR, check `docs/adr/ADR-001-webhook-driven-agent-architecture.md` first to avoid duplicating what's already there.
- Items 1–5 above are candidates for a second ADR ("Operational Gotchas").

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/ADR-001-webhook-driven-agent-architecture.md` — the existing authoritative spec; read to understand what's already covered.
- `docs/learned/` — the source of truth for operational gotchas not yet formalized into ADRs.
- Claude Agent SDK type definitions — `result.subtype` on result messages is not prominently documented; check the SDK source.
