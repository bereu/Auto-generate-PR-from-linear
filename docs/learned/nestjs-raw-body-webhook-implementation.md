# What I Learned: NestJS Raw Body Webhook Implementation

**Date:** 2026-03-25

## What I Learned This Session

### NestJS default body parser breaks HMAC signature verification

NestJS's default body parser (`bodyParser: true`) consumes the request body before any custom middleware runs. When you need raw bytes for HMAC verification (e.g., Linear webhook `linear-signature`), you **must** disable it:

```ts
// src/main.ts
const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });

app.use(
  json({
    verify: (req, _res, buf) => {
      (req as Request & { rawBody: Buffer }).rawBody = buf;
    },
  }),
);
```

Without `bodyParser: false`, `req.rawBody` will always be `undefined` even though the `verify` callback is registered — NestJS already parsed the body by then.

### `req.rawBody` requires a type cast in TypeScript

Express's `Request` type does not include `rawBody`. You need to cast it at every access point:

```ts
const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
```

Forgetting the `?` causes a strict-null error; using it forces an explicit guard before use.

### `timingSafeEqual` requires equal-length buffers or it throws

`crypto.timingSafeEqual(a, b)` throws if `a.length !== b.length`. Always check lengths first:

```ts
if (expected.length !== received.length) return false;
return timingSafeEqual(expected, received);
```

### Magic strings in webhook filtering should be constants

Conditions like `payload.type !== "Issue"` and `payload.action !== "create"` are scattered by default. Extracting them prevents silent typo bugs:

```ts
const WEBHOOK_TYPE_ISSUE = "Issue";
const WEBHOOK_ACTIONS = ["create", "update"] as const;
```

### `JSON.parse` on an untrusted body must be wrapped

`JSON.parse(rawBody.toString())` throws on malformed input. In a NestJS controller you must catch and convert to `BadRequestException` — otherwise NestJS returns a 500 with an internal stack trace instead of a 400.

## What a New Team Member Should Know

1. The entry point for the webhook server is `src/main.ts`. The `bodyParser: false` line is intentional — do not remove it.
2. Signature verification lives in `WebhookService.verifySignature()` (`src/webhook/webhook.service.ts`). It receives a `Buffer`, not a string — don't convert early.
3. Filtering logic order: type check → action check → label check → state check. All early returns are intentional to avoid unnecessary processing.
4. `processIssue()` is async and deliberately fire-and-forget inside `handleWebhook`. Errors are logged but not re-thrown to avoid blocking the HTTP response.

## Docs & Info That Would Speed Things Up Next Time

- NestJS docs on raw body: https://docs.nestjs.com/faq/raw-body — explains the `bodyParser: false` + custom `verify` pattern explicitly.
- Linear webhook payload shape: `src/webhook/webhook.service.ts` interfaces (`LinearWebhookPayload`, `LinearWebhookData`) are the source of truth; Linear's official docs don't always match the actual payload fields.
- Test coverage for the controller/service split is in `src/webhook/webhook.service.test.ts` — the controller itself is not unit-tested because all logic lives in the service.
