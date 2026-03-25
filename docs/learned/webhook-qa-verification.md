# What I Learned: Webhook QA Verification

**Date:** 2026-03-25

## What I Learned This Session

### State IS Checked at the Webhook Entry Point (Plan vs. Reality)

`nestjs-webhook-plan-refinement.md` states "Webhook Trigger Condition: Label Only, No State Filter" — but the actual implementation adds a state check:

```ts
// src/webhook/webhook.service.ts:64
if (data.state.name !== LINEAR_STATES.todo) return;
```

Filtering order in the final implementation: **type → action → label → state**. All four must pass. The plan doc is wrong on this point; trust the code.

### Fire-and-Forget Uses `.catch()`, Not `void`

The fire-and-forget call is not a bare `void processIssue(...)`. It uses `.catch()` to ensure errors are always logged:

```ts
processIssue(issue).catch((err: Error) => {
  logger.error(`[webhook] processIssue failed for ${issue.id}: ${err.message}`);
});
```

Using `void` silently discards errors. This pattern guarantees visibility of failures without blocking the response.

### QA Confirmed: Webhook Returns 200 Before `processIssue` Runs

Manual curl testing confirmed the fire-and-forget behavior in practice:

- Webhook returns HTTP 200 immediately
- Server log shows `processIssue` being called **after** the response
- Even when `processIssue` fails (e.g., fake issue ID), the webhook response is unaffected

### Invalid JSON Returns 400, Not 500

`BadRequestException` in the JSON parse `catch` block converts parse errors to 400 responses. Without this explicit catch, NestJS would propagate the `SyntaxError` as a 500 — which leaks stack traces and confuses callers.

## What a New Team Member Should Know

- The plan docs may be out of sync with the implementation. When in doubt, read `src/webhook/webhook.service.ts` directly — it is the authoritative source for filtering logic.
- Do not add `await` before `processIssue()` in the webhook handler. This is intentional to prevent Linear retry storms from long-running Claude sessions.
- To test the webhook locally, you must compute a real HMAC-SHA256 hex signature over the raw JSON body using `LINEAR_WEBHOOK_SECRET`. A missing or invalid `linear-signature` header returns 401.

## Docs & Info That Would Speed Things Up Next Time

- `src/webhook/webhook.service.ts` — the actual filter logic; more reliable than any planning doc.
- `docs/learned/nestjs-raw-body-webhook-implementation.md` — explains `bodyParser: false`, raw body Buffer handling, and `timingSafeEqual` gotchas.
- `docs/learned/nestjs-webhook-plan-refinement.md` — useful for context but **outdated on the state filter claim**.
