# What I Learned: ADR Gap Analysis and Working Log Synthesis

**Date:** 2026-03-26

## What I Learned This Session

### 1. Criteria for ADR inclusion vs. learned-docs separation

Not every entry in `docs/learned/` belongs in an ADR. The distinction that worked:

- **ADR candidate**: appears in 2+ logs, not inferrable from code alone, and would trap a newcomer (e.g., `settingSources: ["project"]` loads the _target_ repo's `.claude/`, not the agent server's config).
- **Learned doc only**: one-time debug finding, environment-specific, or generic knowledge (e.g., "npm install failed due to Node version").

Applying this filter reduced 19 log entries to 6 ADR-002 candidates and 5 Fly.io deployment items.

### 2. `docs/learned/replace-polling-with-webhook.md` is stale — Hono was replaced by NestJS

That doc documents Hono as the HTTP framework for receiving Linear webhooks. NestJS replaced Hono in the same sprint. The file has no deprecation notice. A new contributor reading it will configure the wrong framework. The authoritative doc is `nestjs-raw-body-webhook-implementation.md`.

**Action needed:** add a deprecation note at the top of `replace-polling-with-webhook.md` pointing to the NestJS doc.

### 3. ADR-001 covers the "what" but not the "why it fails silently"

ADR-001 states that `Edit` is excluded from `allowedTools`, but does not explain the failure mode: if a target repo's CLAUDE.md tells Claude to use `Edit`, those calls are silently rejected — the sub-agent appears to do nothing. The observable symptom is that files are unchanged after the agent run with no error in logs.

### 4. Synthesis order matters: read all logs before writing candidates

Trying to draft ADR sections while still reading logs caused redundant candidates (same finding described twice across logs). The correct order: read all 19 entries first, cluster by theme, then write once per theme.

## What a New Team Member Should Know

- There are now two overlapping docs for the webhook implementation: one for Hono (stale) and one for NestJS (current). Always trust the newer one (`nestjs-raw-body-webhook-implementation.md`).
- Before writing a new ADR, check whether the finding is already captured in `docs/learned/` and whether it meets the 3-criteria bar above (multi-log, non-inferrable, newcomer trap). Single-occurrence or code-readable items do not belong in ADRs.
- The `adr-gap-analysis-and-adr002-proposal.md` and `working-log-synthesis-and-doc-hygiene.md` files in `docs/learned/` capture the full analysis from this session.

## Docs & Info That Would Speed Things Up Next Time

- Read `docs/adr/ADR-001.md` first to know what is already covered before synthesizing logs — avoids re-documenting the same decisions.
- `src/repos.config.ts` is the single source of truth for all tunable constants (not any learned doc). When a doc conflicts with that file, the file wins.
- `docs/learned/` currently has 19 entries (as of 2026-03-26); scanning all takes ~15 min. A future time-saver would be a one-line summary at the top of each file.
