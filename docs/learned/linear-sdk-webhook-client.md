# What I Learned: Linear SDK Webhook Verification Client

**Date:** 2026-03-27

## What I Learned This Session

### `@linear/sdk` has a sub-path export `@linear/sdk/webhooks` — not part of the main bundle

The `@linear/sdk` package exposes a separate `./webhooks` sub-path export. Importing from `@linear/sdk` will NOT give you webhook utilities. You must use:

```typescript
import {
  LinearWebhookClient,
  LINEAR_WEBHOOK_SIGNATURE_HEADER,
  LINEAR_WEBHOOK_TS_HEADER,
} from "@linear/sdk/webhooks";
```

Available exports from `@linear/sdk/webhooks`:

- `LinearWebhookClient` — class for verifying and parsing webhook payloads
- `LINEAR_WEBHOOK_SIGNATURE_HEADER` — string constant `"linear-signature"`
- `LINEAR_WEBHOOK_TS_HEADER` — string constant for the timestamp header
- `LINEAR_WEBHOOK_TS_FIELD` — field name inside the payload body

### `LinearWebhookClient.verify()` signature includes an optional timestamp for replay protection

```typescript
const client = new LinearWebhookClient(secret);
client.verify(rawBody, signature, timestamp?);
// throws Error("Invalid webhook signature") on failure — does NOT return false
```

Key difference from the manual implementation in `webhook.service.ts`:

- **Manual impl**: returns `boolean`, caller throws `UnauthorizedException`
- **SDK `verify()`**: throws `Error` directly

The `timestamp` parameter (3rd arg) enables replay attack protection: if provided, the SDK checks that the webhook timestamp is within an acceptable window. Without it, old signed payloads could be replayed.

### Timestamp verification IS active — controller reads both headers

`WebhookController` (`src/webhook/webhook.controller.ts:25`) reads both:

- `@Headers(LINEAR_WEBHOOK_SIGNATURE_HEADER)` → `signature`
- `@Headers(LINEAR_WEBHOOK_TS_HEADER)` → `timestamp` (optional)

Both are passed to `IssueEventService.receiveEvent(rawBody, signature, timestamp)`, so the SDK's 60-second replay window is enforced whenever Linear sends the timestamp header.

### `LinearWebhookClient` also provides `parseVerifiedPayload()` and handler wiring

Beyond `verify()`, the SDK client has `parseBodyAsWebhookPayload()` and `collectHandlers()` for a full handler registration pattern. The project currently ignores these and does its own filtering logic in `ImplementIssueCommand` — that is intentional (project-specific filtering by label/state).

## What a New Team Member Should Know

- Do not use `@linear/sdk` main import for webhook verification — use the `@linear/sdk/webhooks` sub-path.
- If you switch `IssueEventService` to use `LinearWebhookClient.verify()`, wrap it in try/catch (it throws, not returns false).
- The timestamp replay protection is active: `LINEAR_WEBHOOK_TS_HEADER` is read in the controller and forwarded to the service. The SDK enforces a 60-second window when it is present.
- The old manual HMAC (`createHmac` + `timingSafeEqual`) has been removed. Do not reintroduce it — `LinearWebhookClient.verify()` is the single source of truth.

## Docs & Info That Would Speed Things Up Next Time

- Check `node_modules/@linear/sdk/package.json` → `exports` field for sub-path entries before assuming everything is in the main barrel export.
- SDK source: `node_modules/@linear/sdk/dist/webhooks-nAfXvD4i.cjs` (or `.mjs`) — small file, readable in seconds.
- Linear docs on webhook verification: mentions HMAC-SHA256 but does not explicitly document `LinearWebhookClient` — reading the SDK source directly is faster.
