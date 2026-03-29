# What I Learned: Dev Script Naming Convention

**Date:** 2026-03-27

## What I Learned This Session

### This project enforces a `dev:*` prefix for all local development entry points

`package.json` has two dev-mode entry points and they must share the same prefix:

| Script               | Entry file          | What it does                                                    |
| -------------------- | ------------------- | --------------------------------------------------------------- |
| `npm run dev:server` | `src/main.dev.ts`   | Webhook server only — no tunnel, no Linear registration         |
| `npm run dev:local`  | `src/main.local.ts` | Webhook server + localtunnel + Linear webhook registration info |

The old name `start:dev` violated this convention. It was renamed to `dev:server` to make both scripts visually group together in `package.json` and in shell autocomplete.

### The distinction between `dev:server` and `dev:local` is not obvious from the names alone

- `dev:server` — use when you only need the HTTP server locally (e.g., testing webhook payloads with curl or Postman, no public URL needed).
- `dev:local` — use when you need Linear to actually call your local machine (requires localtunnel, requires Linear webhook to be re-registered or auto-registered to the tunnel URL).

If you run `dev:server` expecting Linear webhooks to hit your local machine, they will not — there is no tunnel.

### Entry file comments must stay in sync with the script name

`src/main.dev.ts` line 3 has a comment: `Run: npm run dev:server`. When the script name changes, this comment must be updated manually — it is not auto-generated.

## What a New Team Member Should Know

- All local dev scripts use the `dev:` prefix. Do not add new dev scripts with `start:` or other prefixes.
- `dev:local` is the "full stack local" mode — tunnel + registration. Use this for end-to-end local testing with Linear.
- `dev:server` is "server only" — no tunnel. Use this for unit/integration testing with canned payloads.
- If you rename a script, update the `Run:` comment at the top of the corresponding entry file.

## Docs & Info That Would Speed Things Up Next Time

- `src/main.local.ts` — shows exactly what extra setup `dev:local` adds on top of `dev:server`.
- `docs/learned/local-tunnel-dev-setup.md` — covers why localtunnel is needed and how Linear webhook registration works locally.
