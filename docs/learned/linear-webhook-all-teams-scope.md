# What I Learned: Linear Webhook "All Teams" Scope Registration

**Date:** 2026-03-25

## What I Learned This Session

### Webhook Scope: "All Teams" vs Team-Specific

- When registering a Linear webhook via `linear-cli webhooks create`, the scope can be set to a specific team or to **all teams**.
- Registering with "all teams" means the webhook receives events from every team in the workspace — useful for an agent that needs to process tickets across all teams.
- The production webhook for this project is named **`production-PR-generatetor`** and is scoped to **all teams**, pointing to `https://bereu-claude-agent.fly.dev/webhook`.

### Webhook Name Is Purely a Label

- The webhook name (`production-PR-generatetor`) is only a human-readable label in Linear — it has no functional effect on routing or behavior.
- However, naming conventions matter: using a descriptive name like `production-PR-generatetor` makes it easy to distinguish from dev/local webhooks in the Linear dashboard.

### One Webhook Registration Per Environment Is Sufficient When Scoped to All Teams

- You don't need to register separate webhooks per Linear team when the agent processes issues across all teams.
- A single "all teams" webhook registration is the correct setup for this agent, which routes issues to repos based on the issue's repo label (not team).

## What a New Team Member Should Know

- The production webhook is already registered as `production-PR-generatetor` for all teams at `https://bereu-claude-agent.fly.dev/webhook`.
- If you need to verify this, run: `linear-cli webhooks list` and look for `production-PR-generatetor`, then `linear-cli webhooks get <id>` to confirm the URL and scope.
- Do **not** re-register a new webhook unless you are intentionally setting up a second environment. Duplicate webhooks cause the agent to process each ticket twice.

## Docs & Info That Would Speed Things Up Next Time

- `docs/learned/linear-webhook-production-registration.md` — covers the full webhook update/management workflow and the webhook ID for this project.
- `docs/learned/local-tunnel-dev-setup.md` — explains how to register a dev-scoped webhook for local testing without affecting production.
