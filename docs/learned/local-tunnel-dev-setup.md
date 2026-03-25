# What I Learned: Local Tunnel Dev Setup for Linear Webhook Testing

**Date:** 2026-03-25

## What I Learned This Session

### `localtunnel` as the tunnel choice — no account, no CLI install

When Linear webhooks require a public HTTPS URL and the developer is working locally, `localtunnel` is the simplest option:

- **No signup or auth token** — unlike ngrok (requires account after a session limit) or cloudflared (requires CLI install)
- **Pure npm** — runs inside the Node process via programmatic API, no system binary needed
- **HTTPS by default** — Linear rejects plain HTTP webhook URLs; localtunnel gives HTTPS free

```bash
pnpm add -D localtunnel
```

```ts
import localtunnel from "localtunnel";
const tunnel = await localtunnel({ port: 3000 });
console.log(tunnel.url); // https://xxxxx.loca.lt
```

### Separate entry point pattern for different runtime modes

The project uses distinct `src/main.*.ts` entry points per run mode instead of env-flag branches inside one file:

| Script                        | Entry point         | What it skips            |
| ----------------------------- | ------------------- | ------------------------ |
| `npm run start`               | `src/main.ts`       | nothing (production)     |
| `npm run start:dev`           | `src/main.dev.ts`   | repo sync                |
| `npm run dev:local` (planned) | `src/main.local.ts` | repo sync + opens tunnel |

Each entry point calls `createApp()` from `src/create-app.ts` and adds its own concerns on top. This avoids runtime conditionals polluting production code.

### `vp exec tsx --env-file=.env` is the run pattern for all entry points

All `package.json` scripts use:

```json
"script-name": "vp exec tsx --env-file=.env src/main.<mode>.ts"
```

`vp` is `vite-plus`, which wraps tsx execution and provides linting/testing toolchain. `--env-file=.env` injects credentials at process start — there is no dotenv call inside app code.

### Clean shutdown requires closing the tunnel explicitly

When using `localtunnel` programmatically, `Ctrl+C` does **not** auto-close the tunnel. You must listen for signals:

```ts
process.on("SIGINT", async () => {
  tunnel.close();
  process.exit(0);
});
tunnel.on("close", () => console.warn("Tunnel closed unexpectedly"));
```

Without this, the tunnel process may keep running or leave a dangling connection.

### localtunnel returns 408 to curl/browser — Linear's servers bypass this automatically

When manually testing with `curl https://xxxxx.loca.lt/webhook`, you will get a `408` response. This is **not** a server bug — it is localtunnel's browser challenge page intercepting the request.

Linear's webhook delivery servers bypass this challenge automatically, so webhooks from Linear arrive at your local server without issue. Do not mistake curl 408 errors for a broken webhook setup.

To test signatures manually without localtunnel interference, hit `localhost:3000/webhook` directly with a computed HMAC header:

```bash
SECRET="your-webhook-secret"
BODY='{"action":"create","type":"Issue",...}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "linear-signature: $SIG" \
  -d "$BODY"
```

## What a New Team Member Should Know

- Linear **requires HTTPS** for webhook URLs — plain `localhost:3000` cannot be registered. Always use a tunnel for local testing.
- The `localtunnel` public URL is ephemeral — it changes every time you restart. You need to re-register the URL in Linear's webhook settings each session.
- The `LINEAR_WEBHOOK_SECRET` in `.env` is the shared secret used to verify HMAC signatures on incoming webhook payloads — you must set the same value in Linear's webhook settings when registering the URL.
- `vp lint` = `vp check --fix && vp lint && pnpm run lint:duplicates` — all three must pass before a task is considered done.

## Docs & Info That Would Speed Things Up Next Time

- `src/main.dev.ts` — read this before writing `main.local.ts`; it shows the exact pattern for skipping repo sync while reusing `createApp()`.
- `src/create-app.ts` — the shared factory; new entry points should call this rather than bootstrapping NestJS manually.
- Linear docs → Settings → API → Webhooks: the UI path for registering a webhook URL and pasting the secret.
- `localtunnel` npm README: covers the `tunnel.on('close')` event and the `subdomain` option (if you want a stable subdomain, though it's not guaranteed).
