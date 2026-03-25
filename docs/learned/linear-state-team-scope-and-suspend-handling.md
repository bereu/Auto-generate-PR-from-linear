# What I Learned: Linear State Team Scope and Suspend Handling

**Date:** 2026-03-25

## What I Learned This Session

### 1. Linear statuses are team-scoped — not workspace-global

`updateIssueState()` in `src/linear.ts` resolves a status name by calling `team.states()`, which returns only the statuses for **that specific team**. If `LINEAR_STATES.suspended = "Suspended"` is set in `repos.config.ts` but the "Suspended" status was not created in the target team's workflow, the call throws:

```
Error: State "Suspended" not found in team
```

This means you must create every status used in `LINEAR_STATES` manually in **each Linear team** that issues will be assigned to. Creating it in one team (e.g., "ENG") does not make it available in another (e.g., "PER").

The status name must also match **exactly** (case-sensitive) what is in the Linear UI.

### 2. Claude Agent SDK signals max_turns via `result.subtype`, not an exception

When Claude reaches `maxTurns`, the SDK does not throw — it resolves normally with:

```ts
result.type === "result";
result.subtype === "error_max_turns";
```

You must check `subtype` explicitly after the `for await` loop. If you only check `result.type`, max_turns events are silently treated as success.

See `src/agent.ts` lines 89–95 for the guard:

```ts
if (result.subtype === "error_max_turns") {
  const suspendedTitle = issue.title.startsWith("[SUSPEND]")
    ? issue.title
    : `[SUSPEND] ${issue.title}`;
  await updateIssueTitle(issue.id, suspendedTitle);
  await updateIssueState(issue.id, LINEAR_STATES.suspended);
  throw new Error("max_turns に達しました");
}
```

### 3. `[SUSPEND]` prefix idempotency guard

The code checks `issue.title.startsWith("[SUSPEND]")` before prepending the prefix. This prevents double-prefixing if the webhook fires again on the same issue after it was already suspended (e.g., `[SUSPEND] [SUSPEND] title`). This is not obvious from the config — it's a retry-safety pattern.

### 4. `processIssue` was made `export` to allow webhook-driven invocation

After the refactor from polling to webhooks, the polling loop (`runAgentLoop`) was deleted from `agent.ts`. `processIssue` was exported so the NestJS webhook service (`src/webhook/webhook.service.ts`) can call it directly when Linear sends an event. The function itself is unchanged — only its visibility and caller changed.

## What a New Team Member Should Know

- Before adding a new state to `LINEAR_STATES` in `repos.config.ts`, go to Linear → Settings → Workflow for **each team** that your issues belong to, and manually create that status. Name must match the string exactly.
- The agent will throw at runtime (not at startup) when a status is missing, so missing statuses are only caught when a real issue is processed.
- When debugging "state not found" errors, use `linear-cli` or the Linear API to list the team's states: the CLI command used in this session was `linear team:states <team-id>`.

## Docs & Info That Would Speed Things Up Next Time

- Linear SDK docs on `team.states()` — confirms this is per-team pagination, not workspace-global.
- `src/repos.config.ts` — the single source of truth for all state name strings. If a state needs to be renamed, change it here and update it in Linear simultaneously.
- Claude Agent SDK result types — the `subtype` field on result messages is not prominently documented; check the SDK source or type definitions for `error_max_turns` and other subtypes.
