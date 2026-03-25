# System Receives Linear Webhook to Trigger Issue Processing

## Context

Currently `runAgentLoop()` polls Linear every 1 minute via `fetchAgentIssues()`. This wastes API quota and adds latency. Linear supports webhooks that push events instantly when issues change state.

Replace the polling loop with a **NestJS** HTTP server that receives Linear webhook events.

## Current State

```ts
// src/index.ts
await syncAllRepos();
await runAgentLoop(); // infinite polling loop

// src/agent.ts — PR body lacks issue description
const prBody = `## Linear タスク\n${issue.url}\n\n## 変更概要\nClaude Code による自動実装`;
```

## Target State

```ts
// src/main.ts (NestJS bootstrap)
await syncAllRepos();
await bootstrap(); // NestJS app listens for Linear webhook events

// src/webhook/webhook.controller.ts
// POST /webhook → verify signature → if label="agent" → processIssue()

// src/agent.ts — PR body includes Linear URL + issue description
const prBody = [
  `## Linear Issue`,
  issue.url,
  ``,
  `## Description`,
  issue.description ?? "No description",
  ``,
  `## Changes`,
  `Auto-implemented by Claude Code`,
].join("\n");
```

## Trigger Logic

**Trigger condition**: issue has label `"agent"` AND state is `"Todo"`

**State flow**:

1. Webhook arrives → check label includes `"agent"` + state is `"Todo"`
2. `processIssue()` starts → set Linear state to `"In Progress"`
3. Claude implements code → creates PR
4. PR created → set Linear state to `"In Review"`

**PR content** (required):

1. Linear ticket URL
2. Issue description from Linear

## Linear Webhook Behavior

Linear sends `POST` to the registered URL on issue create/update.

Payload shape (relevant fields):

```json
{
  "action": "create or update",
  "type": "Issue",
  "data": {
    "id": "abc123",
    "title": "Fix login bug",
    "description": "Detailed description of the issue",
    "url": "https://linear.app/...",
    "state": { "name": "Todo" },
    "labels": [{ "name": "agent" }]
  }
}
```

Signature: `linear-signature` header = HMAC-SHA256(rawBody, LINEAR_WEBHOOK_SECRET) in hex.

## Action Items

- [x] **Install NestJS dependencies**
  - `pnpm add @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs`
  - `pnpm add -D @types/express`

- [x] **Create NestJS module structure**

  ```
  src/
    main.ts                    ← NestJS bootstrap
    app.module.ts              ← root module
    webhook/
      webhook.module.ts
      webhook.controller.ts   ← POST /webhook, GET /health
      webhook.service.ts      ← signature verification + issue dispatch
  ```

- [x] **Create `src/webhook/webhook.service.ts`**
  - `verifySignature(secret, rawBody, signature): boolean` — HMAC-SHA256 via `crypto.timingSafeEqual`
  - `handleWebhook(rawBody: Buffer, signature: string): void`
    - Verify signature → throw `UnauthorizedException` on failure
    - Guard: `type === "Issue"` and `action` in `["create", "update"]`
    - Guard: `data.labels` includes `LINEAR_LABEL` and `data.state.name === LINEAR_STATES.todo`
    - Build `LinearIssue` from payload data
    - Fire-and-forget: `processIssue(issue).catch(err => logger.error(...))`

- [x] **Create `src/webhook/webhook.controller.ts`**
  - `POST /webhook` — verify `linear-signature`, call service, return `{ ok: true }`
  - `GET /health` → `{ status: "ok" }`
  - Use `@Inject(WebhookService)` (explicit token — tsx/esbuild has no `emitDecoratorMetadata`)

- [x] **Create `src/webhook/webhook.module.ts`** and **`src/app.module.ts`**

- [x] **Update `src/agent.ts`**
  - Export `processIssue`
  - Remove `runAgentLoop` and `fetchAgentIssues` import
  - Update PR body to include Linear URL + issue description

- [x] **Create `src/main.ts`** (NestJS entry point, replaces `src/index.ts`)
  - Validate env vars: `GITHUB_TOKEN`, `LINEAR_API_KEY`, `ANTHROPIC_API_KEY`, `LINEAR_WEBHOOK_SECRET`
  - Call `syncAllRepos()` before bootstrap
  - Enable raw body parsing via express `json({ verify: ... })`
  - Listen on `WEBHOOK_PORT` (3000)

- [x] **Delete `src/index.ts`** (replaced by `src/main.ts`)

- [x] **Add `WEBHOOK_PORT = 3000` to `src/repos.config.ts`**

- [x] **Update `package.json` start script** to `vp exec tsx src/main.ts`

- [x] **Update `tsconfig.json`**
  - Add `experimentalDecorators: true`, `emitDecoratorMetadata: true`
  - Set `useDefineForClassFields: false` (required for NestJS decorators)
  - Remove `erasableSyntaxOnly: true` (conflicts with decorator metadata)

- [x] **Run `vp lint`** — 0 errors, 0 clones

## Acceptance Criteria

- [x] `POST /webhook` with valid signature + `label="agent"` + `state="Todo"` → calls `processIssue()` fire-and-forget
- [x] `POST /webhook` with invalid signature → HTTP 401
- [x] `POST /webhook` with no `"agent"` label → silently ignored (HTTP 200)
- [x] After `processIssue()` completes → Linear state is `"In Review"` (handled in `agent.ts`)
- [x] PR body contains Linear issue URL and issue description
- [x] `GET /health` → `{ status: "ok" }`
- [x] Polling loop (`runAgentLoop`) fully removed
- [x] `LINEAR_WEBHOOK_SECRET` missing at startup → `process.exit(1)`
- [x] `vp test run` — 10/10 tests pass
- [x] `vp lint` passes with 0 errors, 0 clones
