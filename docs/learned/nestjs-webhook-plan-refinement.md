# What I Learned: NestJS Webhook Plan Refinement

**Date:** 2026-03-25

## What I Learned This Session

### Framework Switched from Hono to NestJS

- The previous session documented **Hono** as the chosen HTTP framework. This session revised the plan to use **NestJS** instead.
- NestJS was chosen because the project already follows a module/service/controller pattern that maps naturally to NestJS conventions (`webhook.module.ts`, `webhook.controller.ts`, `webhook.service.ts`).
- The Hono learning doc (`replace-polling-with-webhook.md`) is now outdated on this point — NestJS is the current decision.

### Webhook Trigger Condition: Label Only, No State Filter

- The trigger check at webhook time is `data.labels includes "agent"` — **state is not checked at the webhook entry point**.
- A previous version of the plan filtered by `state.name === "Todo"` at webhook time. This was removed — `processIssue()` sets the state to `"In Progress"` itself as its first step.
- Filtering by state at webhook time would cause missed events (e.g., if an issue is created directly in "In Progress" with the label).

### State Flow Is Linear-Driven, Not Webhook-Driven

- The state machine is managed inside `processIssue()` / `agent.ts`, not in the webhook handler:
  1. Webhook arrives → label check only
  2. `processIssue()` starts → **sets state to "In Progress"**
  3. `runClaude()` completes + PR created → **sets state to "In Review"**
- `updateIssueState(issue.id, LINEAR_STATES.inReview)` already exists in `agent.ts` — the plan makes this explicit but no new code is needed for it.

### PR Body Must Include Issue Description (Not Just URL)

- The old PR body only had the Linear URL:
  ```ts
  const prBody = `## Linear タスク\n${issue.url}\n\n## 変更概要\nClaude Code による自動実装`;
  ```
- The required format now includes `issue.description` from the webhook payload:

  ```ts
  ## Linear Issue
  {issue.url}

  ## Description
  {issue.description ?? "No description"}

  ## Changes
  Auto-implemented by Claude Code
  ```

- This means `LinearIssue` type must carry `description` and it must be populated from the webhook payload's `data.description`.

## What a New Team Member Should Know

- **Do not filter state at the webhook layer.** The webhook handler only checks label; state transitions are the agent's responsibility.
- **Hono is NOT the chosen framework** despite an older learning doc saying so. NestJS is current.
- **Raw body must be buffered before JSON parsing** — this is unchanged from the previous session's learnings. In NestJS, enable it via: `app.use(json({ verify: (req, _, buf) => { req.rawBody = buf } }))` in `main.ts`.
- `processIssue()` must be fire-and-forget (no `await`) in the webhook handler to avoid Linear retry storms.

## Docs & Info That Would Speed Things Up Next Time

- `docs/tasks/active/receive-linear-webhook.md` — the authoritative implementation plan with NestJS structure, all action items, and acceptance criteria. Read this before implementing any webhook code.
- `docs/learned/replace-polling-with-webhook.md` — still useful for HMAC signature details and fire-and-forget rationale, but **ignore** the Hono framework section.
