# What I Learned: ADR Gap Analysis — What ADR-001 Does NOT Cover

**Date:** 2026-03-26

## What I Learned This Session

This session reviewed `docs/learned/` entries against ADR-001 to find which operational facts are undocumented and would surprise a new contributor. Five gaps were identified.

### 1. ADR-001 covers architecture, not runtime constraints

ADR-001 documents: flow diagram, trigger conditions, suspension-on-max-turns, constants, 5-layer access rules, SSH/GITHUB_TOKEN usage, fire-and-forget response. It does NOT cover how the Claude Agent SDK is configured, how Linear statuses are provisioned, or what happens when defaults are wrong for local dev.

### 2. Sub-agent `allowedTools` omits `Edit` — silently rejected

`src/agent.ts` passes `allowedTools` that includes `Read` and `Write` but NOT `Edit`. If the target repo's CLAUDE.md tells Claude to use `Edit`, those calls are silently rejected. Debugging looks like the sub-agent "doing nothing" on file edits.

### 3. `settingSources: ["project"]` with `cwd: wtPath` loads the TARGET repo's config

The sub-agent loads the target repo's `.claude/` (CLAUDE.md, skills, hooks), not the agent server's. This means behavior is controlled by whoever maintains the target repo — a non-obvious indirection.

### 4. Linear statuses are team-scoped, case-sensitive, and checked at runtime

`"Suspended"` (and all `LINEAR_STATES` entries) must be manually created per Linear team. A missing status throws at **runtime**, not startup — hours of confusion if you create the status in one team but route issues from another.

### 5. Claude Agent SDK: max-turns resolves normally, not throws

`result.subtype === "error_max_turns"` — not an exception. Checking only `result.type` silently passes max-turns as success. `src/agent.ts` lines 89–95.

### 6. `WORKSPACE` default is `/workspace` (Docker) — breaks local dev with ENOENT

`repos.config.ts` defaults `WORKSPACE` to `/app/workspace`. Local `.env` must override this. No startup warning — first worktree operation just fails.

### 7. ADR files must be ≤100 lines (unstated team rule)

No linter enforces this. Manual convention only.

## What a New Team Member Should Know

- ADR-001 is the architectural spec, not the operational runbook. Treat `docs/learned/` as the companion runbook.
- When the sub-agent silently fails on file edits, check `allowedTools` in `src/agent.ts` first — `Edit` is intentionally excluded.
- Before adding a new Linear team to `repos.config.ts`, manually create all statuses from `LINEAR_STATES` in that team with exact names.
- Copy `.env.example` and set `WORKSPACE` before running locally.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/ADR-001-webhook-driven-agent-architecture.md` — the hard boundary for what's already documented.
- `src/agent.ts` lines 57–95 — `allowedTools` list and max-turns subtype check.
- `src/repos.config.ts` — `WORKSPACE` default and `LINEAR_STATES` names.
- `src/linear.ts` `updateIssueState()` — where team-scoped status lookup fails at runtime.
