# What I Learned: Replace Polling with Linear Webhook

**Date:** 2026-03-25

## What I Learned This Session

### Linear Webhook Signature Verification

- The `linear-signature` header contains HMAC-SHA256(rawBody, LINEAR_WEBHOOK_SECRET) encoded as a **hex string** — not base64.
- **Raw body must be read as a buffer before JSON parsing.** If you call `req.json()` first, the body stream is consumed and you cannot re-read it for HMAC — always buffer the raw bytes first, then parse.
- Use `crypto.timingSafeEqual` (not `===`) for comparing HMAC digests. Standard string equality leaks timing information and is exploitable.

### Fire-and-Forget Is Non-Negotiable for Webhook Handlers

- `processIssue()` runs a full Claude session (potentially minutes). If the webhook handler awaits it, Linear will time out and retry — causing duplicate processing.
- The correct pattern: call `processIssue(issue)` **without** `await`, respond HTTP 200 immediately, and let the async work continue in the background.
- This is a silent correctness issue — a naive `await processIssue()` appears to work locally but causes retries in production.

### Hono Chosen as HTTP Framework

- `hono` is the chosen HTTP server framework (not Express, Fastify, etc.) — this decision is not documented anywhere else.
- Hono has native TypeScript support and runs on Node.js via `@hono/node-server` — the import pattern is `import { serve } from "@hono/node-server"`.

### Webhook vs. Polling Tradeoff

- The polling loop (`runAgentLoop`) consumed 1 Linear API call per minute regardless of activity. Webhooks eliminate this quota usage and reduce latency from up to 60s to near-instant.
- `runAgentLoop` export is removed entirely when switching to webhooks — it should not be kept as a fallback without explicit intent.

### `LINEAR_WEBHOOK_SECRET` Env Var

- A new required env var `LINEAR_WEBHOOK_SECRET` is added. The startup check in `src/index.ts` must be updated to include it — missing it at startup should call `process.exit(1)` like the other required vars.
- The secret is configured in the Linear workspace dashboard under Settings → API → Webhooks.

## What a New Team Member Should Know

- **Do not buffer the body after parsing**: When adding middleware to the Hono app, ensure raw body access happens before any JSON middleware runs. In Hono, use `c.req.raw.arrayBuffer()` or similar to get the raw bytes before `c.req.json()`.
- **Webhook filtering logic**: Only `type === "Issue"` events with `action === "create" | "update"`, `state.name === "Todo"`, and label `"agent"` trigger processing. Everything else returns 200 silently — this is intentional to avoid noisy logs.
- **`WEBHOOK_PORT`** defaults to `3000` (set in `repos.config.ts`). On Fly.io the internal port in `fly.toml` must match this value.

## Docs & Info That Would Speed Things Up Next Time

- Linear webhook payload shape and signature format: `docs/tasks/active/receive-linear-webhook.md` — the full payload JSON schema and HMAC details are documented there. Read this before touching `src/webhook.ts`.
- Hono docs for raw body access: the pattern for reading raw body bytes in Hono differs from Express — check Hono's official docs for `HonoRequest` body methods before implementing.
