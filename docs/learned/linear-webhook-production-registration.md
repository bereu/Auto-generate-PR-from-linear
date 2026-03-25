# What I Learned: Linear Webhook Production Registration

**Date:** 2026-03-25

## What I Learned This Session

### `linear-cli` Webhook Management Commands

- List all webhooks: `linear-cli webhooks list` — shows IDs and truncated URLs
- Get full details of one webhook: `linear-cli webhooks get <id>` — shows complete URL and config
- Update a webhook URL: `linear-cli webhooks update <id> --url <new-url>`
- The registered webhook ID for this project: `576334fc-be43-48c0-bcfb-a47394cabd2d`

### Localtunnel URL Is Not Persisted Across Sessions

- During local dev setup, the webhook is registered with the localtunnel URL (`https://<slug>.loca.lt/webhook`).
- When local dev ends, that URL becomes unreachable — but the webhook registration in Linear still points to it.
- Production Fly.io URL is **not** automatically registered when deploying. You must manually update the webhook to `https://bereu-claude-agent.fly.dev/webhook` after the first production deploy.
- Forgetting this step means Linear sends all webhook events to the dead localtunnel URL, and the production agent never processes any tickets — no errors, just silence.

### Two Separate Webhook Registrations Are Needed (Dev vs. Prod)

- Local dev uses localtunnel (`https://<slug>.loca.lt/webhook`) — ephemeral, changes per session.
- Production uses Fly.io (`https://bereu-claude-agent.fly.dev/webhook`) — stable, update once.
- Ideal setup: register two separate webhooks in Linear, one for each environment. This way switching between dev and prod doesn't require re-registering.

## What a New Team Member Should Know

- After first Fly.io deploy, run: `linear-cli webhooks update 576334fc-be43-48c0-bcfb-a47394cabd2d --url https://bereu-claude-agent.fly.dev/webhook`
- If the agent is running on Fly but no tickets are being processed, the first thing to check is the webhook registration: `linear-cli webhooks get 576334fc-be43-48c0-bcfb-a47394cabd2d` — verify the URL matches the Fly domain.
- `linear-cli webhooks list` shows truncated URLs. Always use `get` with the ID to see the full URL.

## Docs & Info That Would Speed Things Up Next Time

- `docs/learned/local-tunnel-dev-setup.md` — explains how the localtunnel dev URL is registered during local testing.
- `fly.toml` — `app = "bereu-claude-agent"` is the canonical app name; the production webhook URL is always `https://<app-name>.fly.dev/webhook`.
