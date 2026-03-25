# What I Learned: NestJS Entry Points Require `reflect-metadata` Import

**Date:** 2026-03-25

## What I Learned This Session

### Every NestJS entry point must explicitly import `reflect-metadata` as the first line

When using tsx (which does not support `emitDecoratorMetadata`), `reflect-metadata` must be manually imported at the top of every entry point file:

```ts
// src/main.ts, src/main.dev.ts, src/main.local.ts — ALL entry points
import "reflect-metadata";
import { createApp } from "./create-app.js";
// ...
```

If this import is missing, NestJS decorators (`@Module`, `@Controller`, `@Injectable`, `@Inject`) will fail silently at runtime — providers resolve as `undefined` and no compile-time error is raised.

The import must be **first** — before any NestJS or application imports — because NestJS's decorator system reads metadata that is only available after `reflect-metadata` patches `Reflect`.

### Dev-only entry points can print secrets — this is intentional

`src/main.local.ts` prints `LINEAR_WEBHOOK_SECRET` directly to stdout:

```ts
logger.info(`  Secret: ${process.env.LINEAR_WEBHOOK_SECRET!}`);
```

This is intentional: the developer needs to paste the exact secret value into Linear's webhook settings UI during local setup. Since `main.local.ts` is never run in production (it's behind `dev:local` script and requires `.env`), leaking the secret to the terminal is acceptable. Do not remove this output — it saves a manual `.env` lookup each session.

### NestJS app does not need `await app.close()` in dev shutdown handlers

The graceful shutdown handler in `main.local.ts` only closes the tunnel and exits:

```ts
const shutdown = (): void => {
  tunnel.close();
  process.exit(0); // NestJS app does not need explicit close() in dev mode
};
```

Calling `await app.close()` before `process.exit(0)` in dev mode is unnecessary — it triggers NestJS lifecycle hooks (onModuleDestroy etc.) which adds latency for no dev benefit. For production (`main.ts`), proper `app.close()` handling would be needed, but dev entry points can skip it.

## What a New Team Member Should Know

- `import "reflect-metadata"` must be the very first import in `main.ts`, `main.dev.ts`, and `main.local.ts`. Missing it from any entry point breaks DI silently.
- The secret printed by `dev:local` is intentional developer ergonomics — you need it to configure Linear's webhook settings each session (localtunnel URL changes on every restart).
- Do not add `await app.close()` to the shutdown handler in dev entry points — it slows `Ctrl+C` without providing value.

## Docs & Info That Would Speed Things Up Next Time

- `src/main.local.ts` — the canonical reference for all three patterns above.
- `docs/learned/nestjs-tsx-esbuild-decorator-setup.md` — covers why `@Inject()` must be explicit when using tsx; pairs with the `reflect-metadata` requirement here.
- `docs/learned/local-tunnel-dev-setup.md` — covers localtunnel programmatic API, SIGINT shutdown, and the entry-point-per-mode pattern.
