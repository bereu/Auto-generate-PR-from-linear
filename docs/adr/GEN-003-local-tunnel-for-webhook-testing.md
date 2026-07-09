---
id: GEN-003
title: Local Tunnel for Webhook Testing
domain: general
rules: false
---

# Local Tunnel for Webhook Testing

## Context

The application is a single NestJS process that is driven almost entirely by **inbound
webhooks** from external services: `POST /slack/events` (Slack Events API, handled by the Chat
SDK via `SlackTransfer`) and `POST /webhook` (Linear). In production these routes are served over
fly.io public HTTPS (see [Production Architecture](./ARCH-001-production-architecture.md)). During
**local development**, however, the server listens on `localhost:3000` (`WEBHOOK_PORT`), which
Slack and Linear cannot reach. To exercise the real end-to-end flow (bug report → clarification →
Linear issue) a developer MUST expose the local port over a public HTTPS URL.

### Pain points without a standardized approach

1. **Silent "bot never responds" failures.** If the tunnel URL registered in the Slack/Linear app
   config does not match the running tunnel, events never arrive and nothing is logged — the most
   time-consuming trap in webhook development.
2. **URL churn.** Default ephemeral tunnels mint a new random URL on every restart, forcing a
   manual Request-URL update in each provider's dashboard each time.
3. **Misdiagnosis.** A `404` on a webhook route is easy to blame on the tunnel when it is actually
   a routing bug (e.g. a mounted module installing a catch-all that shadows the controller).
4. **Leaking dev endpoints.** Tunnel URLs pasted into committed files or used for anything beyond
   local testing create security and reliability hazards.

### Alternatives analysis

- **localtunnel** (`localtunnel` npm, already a project dependency): zero-config, free, supports a
  requested `--subdomain`. Downsides: unreliable (intermittent `408`/`502` observed), and shows a
  browser reminder/password page (bypassed by non-browser POSTs such as Slack's).
- **ngrok**: more reliable, supports reserved domains for a stable URL, richer request inspection.
  Downsides: requires an account/auth token; free tier has session/rate limits.
- **Cloudflare Tunnel**: robust and free, but heavier setup (named tunnel + DNS) than warranted for
  ad-hoc local testing.
- **Deploy-to-test on fly.io**: highest fidelity but slow feedback loop and pollutes a shared
  environment; unsuitable for tight iteration.

### Project-specific motivation

For this project, `npm run dev:local` (`src/main.local.ts`) already starts the webhook server
**and** opens a localtunnel, printing the public URL. localtunnel is therefore the default because
it is already wired in and dependency-free. ngrok is the sanctioned fallback when a stable,
reliable URL matters. The webhook controllers live in the Controller layer per
[Layer Architecture](./BE-001-layer-architecture.md).

## Decision

Local webhook testing MUST use a public HTTPS tunnel to `localhost:3000`, and the tunnel MUST
expose a **stable URL** whenever it will be registered in a provider dashboard.

- **Scope:** local development and manual/E2E testing only. This ADR does NOT cover production
  ingress, which is fly.io public HTTPS per ARCH-001.
- **Default tool:** localtunnel via `npm run dev:local` (server + tunnel), or `npm run dev:server`
  plus a separately-run tunnel (`npx localtunnel --port 3000 --subdomain <unique-name>`).
- **Stable URL:** when a URL is registered in Slack/Linear, the tunnel MUST be started with a fixed
  `--subdomain` so the Request URL is configured once and survives restarts.
- **Route mapping:** Slack Events Request URL is `<public-url>/slack/events`; Linear webhook URL is
  `<public-url>/webhook`.
- **Reliability escalation:** if localtunnel is unstable, use ngrok with a reserved domain
  (`ngrok http 3000 --domain=<reserved>`).

## Do's and Don'ts

### Do

- **DO** start the tunnel with a fixed `--subdomain <unique-name>` (e.g. `npx localtunnel --port 3000 --subdomain my-bugbot`) so the URL is stable across restarts.
- **DO** verify the granted URL after startup — the requested subdomain is best-effort and falls back to a random name if taken.
- **DO** set the Slack Events Request URL to `<public-url>/slack/events` and the Linear webhook to `<public-url>/webhook`.
- **DO** confirm reachability before configuring providers: `GET <public-url>/health` returns `200`, and an unsigned `POST <public-url>/slack/events` returns `401` (route reachable + signature guard active).
- **DO** switch to `ngrok http 3000 --domain=<reserved>` when a reliable, fixed URL is required.
- **DO** treat tunnels as ephemeral dev tooling and stop them when finished.

### Don't

- **DON'T** rely on the default random tunnel URL for any persistent Slack/Linear configuration.
- **DON'T** point the Slack Request URL at `/webhook` — that is the Linear endpoint.
- **DON'T** use a tunnel URL for production traffic; production ingress is fly.io per ARCH-001.
- **DON'T** commit, hardcode, or share tunnel URLs (they are transient and expose your machine).
- **DON'T** assume a `404` on a webhook route is a tunnel problem — check for route shadowing (e.g. a mounted module's catch-all) before touching the tunnel.

## Consequences

### Positive

- **Realistic testing:** exercises the true signed-webhook path (signature verification, Chat SDK, coordinator, Mastra triage) rather than synthetic requests.
- **Stable config:** a fixed subdomain means the provider Request URL is set once.
- **Fast diagnosis:** the `/health` 200 + unsigned `/slack/events` 401 checks isolate tunnel issues from routing/auth issues in seconds.
- **Zero setup by default:** `npm run dev:local` requires no extra accounts.

### Negative

- **localtunnel unreliability:** intermittent `408`/`502` responses can interrupt a session.
- **Manual provider setup:** the Request URL must still be entered in each provider dashboard once.
- **Subdomain contention:** a desired `--subdomain` may be taken, silently yielding a random URL.

### Risks

- **Stale Request URL causes silent failures.** Mitigation: always use `--subdomain`, and run the two verification checks (`/health` 200, unsigned `/slack/events` 401) before testing.
- **Accidental exposure of a local machine.** Mitigation: keep tunnels dev-only, stop them when idle, and never commit URLs; signature verification (HMAC) rejects unsigned traffic.
- **Provider verification failure (challenge not echoed).** Mitigation: confirm the app echoes the Slack `url_verification` challenge (HTTP 200) via the public URL before saving in Slack.

## Compliance and Enforcement

- **Automated enforcement:** none (`rules: false`) — this is a workflow convention, not a static-code rule.
- **Manual enforcement:** reviewers MUST confirm no tunnel URLs are committed to the repository or configuration files, and that any webhook-testing instructions reference `--subdomain` and the correct route paths.
- **Scaffolding:** `npm run dev:local` and `npm run dev:server` are the sanctioned entry points; new webhook integrations SHOULD document their local Request URL path in the feature docs.
- **Exceptions:** using an alternative tunnel provider is permitted; production ingress changes require a separate ADR and lead-architect approval.

## References

- [Production Architecture — Slack Bug Triage to Automated PR](./ARCH-001-production-architecture.md) — production public endpoints (fly.io HTTPS)
- [Layer Architecture of BE](./BE-001-layer-architecture.md) — webhook controllers live in the Controller layer
- [localtunnel](https://github.com/localtunnel/localtunnel)
- [ngrok reserved domains](https://ngrok.com/docs/network-edge/domains-and-tcp-addresses/)
- [Slack Events API — request URL verification](https://api.slack.com/apis/connections/events-api#handshake)
