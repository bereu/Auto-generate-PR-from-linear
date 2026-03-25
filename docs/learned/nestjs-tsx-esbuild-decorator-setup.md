# What I Learned: NestJS with tsx/esbuild — Decorator Setup

**Date:** 2026-03-25

## What I Learned This Session

### NestJS + tsx requires explicit `@Inject()` — no `emitDecoratorMetadata` auto-support

tsx (and esbuild in general) does not emit TypeScript decorator metadata at runtime. NestJS normally resolves constructor dependencies via `emitDecoratorMetadata` — without it, the standard `constructor(private svc: WebhookService)` pattern silently injects `undefined`.

The fix: use explicit injection tokens everywhere:

```ts
// webhook.controller.ts
constructor(@Inject(WebhookService) private readonly service: WebhookService) {}
```

Without `@Inject(WebhookService)`, the injected value is `undefined` at runtime even if the module wiring looks correct. There is no compile-time error — it only surfaces when a method is called on the service.

### `tsconfig.json` requires four changes to support NestJS decorators

```json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "useDefineForClassFields": false // required — NestJS decorators break without this
  }
}
```

Additionally: **remove `erasableSyntaxOnly: true`** if present — it conflicts with decorator metadata emission and causes a compile error.

`useDefineForClassFields: false` is non-obvious: without it, TypeScript uses the native class fields spec which runs field initializers before decorators, breaking NestJS's metadata collection.

### Plan docs go stale within a single session

During this session, the implementation plan changed twice:

1. Framework switched from Hono → NestJS
2. State filter was removed, then re-added

The planning docs (`nestjs-webhook-plan-refinement.md`) were written mid-session and were already out of date by the time implementation finished. **Always treat `src/` as the source of truth — not docs.**

### Filtering order matters for early exits

The webhook handler filters in this order: **type → action → label → state**. Each guard is a `return` (not an exception) so Linear gets HTTP 200 even for ignored events. If state were checked before label, events with the right label but wrong state would be silently discarded — causing missed triggers if the label is set on an issue already "In Progress".

## What a New Team Member Should Know

- When adding new NestJS providers, always use `@Inject(Token)` explicitly — never rely on type-based inference to work with tsx.
- The four `tsconfig.json` settings above are all required. Removing any one of them will break either compilation or runtime DI silently.
- Planning docs in `docs/learned/` and `docs/tasks/` can be out of date. When they contradict the code, trust the code. Update the doc.

## Docs & Info That Would Speed Things Up Next Time

- `src/webhook/webhook.controller.ts` — shows the `@Inject()` pattern used throughout.
- `docs/learned/nestjs-raw-body-webhook-implementation.md` — covers `bodyParser: false` and `timingSafeEqual` gotchas; read alongside this doc before touching the webhook stack.
- NestJS custom providers docs (injection tokens) explain why explicit tokens are required when metadata reflection is unavailable.
