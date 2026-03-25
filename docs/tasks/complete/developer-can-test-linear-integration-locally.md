# Developer Can Test Linear Webhook Integration Locally

## Context

Currently there is no easy way to test the full Linear → webhook → agent pipeline locally. The developer has to deploy to a public server before being able to register a webhook URL in Linear's settings.

`npm run dev:local` should:

1. Start the NestJS webhook server (skipping repo sync, like `start:dev`)
2. Open a public HTTPS tunnel to `localhost:3000` using `localtunnel`
3. Print the public URL so the developer can paste it into Linear's webhook settings

## Current State

```
npm run start:dev   ← local only, no public URL
npm run start       ← production, requires real credentials + git repos
```

No tunnel integration exists.

## Target State

```
npm run dev:local
```

Output:

```
🧪 [DEV] Starting webhook server (repo sync skipped)
✅ Webhook server on port 3000
🌐 Public URL: https://xxxxx.loca.lt
──────────────────────────────────────────────────
Register this URL in Linear:
  Settings → API → Webhooks → New Webhook
  URL:    https://xxxxx.loca.lt/webhook
  Secret: (value of LINEAR_WEBHOOK_SECRET in .env)
──────────────────────────────────────────────────
```

## Tunnel Choice: localtunnel

- **No account / token required** — works out of the box
- **npm package** — no CLI install needed, runs inside Node process
- **HTTPS** — Linear webhooks require HTTPS
- Package: `localtunnel` (`lt` CLI + programmatic API)

## Action Items

- [x] **Install `localtunnel` as dev dependency**

  ```
  pnpm add -D localtunnel
  ```

- [x] **Add `@types/localtunnel` if available, else declare types inline**
  - Check: `pnpm add -D @types/localtunnel`
  - If not available, use `// @ts-ignore` or write a minimal `.d.ts`

- [x] **Create `src/main.local.ts`**
  - Import `validateEnv`, `createApp` from `./create-app.js`
  - Import `localtunnel` from `localtunnel`
  - Start NestJS app on `WEBHOOK_PORT`
  - Open tunnel: `const tunnel = await localtunnel({ port: WEBHOOK_PORT })`
  - Print the registration guide box with `tunnel.url`, `/webhook` path, and `LINEAR_WEBHOOK_SECRET` hint
  - On `tunnel.on("close")` → log warning that tunnel closed
  - On `SIGINT`/`SIGTERM` → `tunnel.close()` then `process.exit(0)`

- [x] **Add `dev:local` script to `package.json`**

  ```json
  "dev:local": "vp exec tsx --env-file=.env src/main.local.ts"
  ```

- [x] **Run `vp lint`** — 0 errors, 0 clones

## Acceptance Criteria

- [x] `npm run dev:local` starts the webhook server on port 3000
- [x] A public HTTPS URL is printed to the console within 5 seconds of start
- [x] The printed URL responds to `GET /health` → `{ status: "ok" }`
- [x] The printed URL responds to `POST /webhook` with correct signature handling
- [x] The console output clearly shows the full `/webhook` URL and the secret value
- [x] `Ctrl+C` cleanly closes the tunnel and exits (SIGINT/SIGTERM handlers registered)
- [x] `vp lint` passes with 0 errors, 0 clones
