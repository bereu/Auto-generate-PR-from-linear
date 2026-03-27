# What I Learned: Working Log Synthesis and Doc Hygiene

**Date:** 2026-03-26

## What I Learned This Session

This session synthesized all 15 working logs into a single summary. The main surprises were about **doc staleness** and **undocumented source-of-truth conventions**.

### 1. `replace-polling-with-webhook.md` is partially obsolete

`docs/learned/replace-polling-with-webhook.md` documents Hono as the HTTP framework, but **NestJS replaced Hono** in the same sprint. A new contributor reading that doc would configure Hono — which is wrong.

What is still valid in that doc:

- HMAC-SHA256 hex signature verification logic
- Fire-and-forget response pattern (do not await the agent call)
- Linear filter order: `type → action → label → state`

What is wrong:

- Framework choice (Hono → NestJS)
- Any Hono-specific middleware patterns

Cross-check with `docs/learned/nestjs-raw-body-webhook-implementation.md` for the current approach.

### 2. `src/repos.config.ts` is the single source of truth for all tunable constants

Every behavioral constant — `LINEAR_STATES`, `WORKSPACE`, repo list, `MAX_TURNS`, labels — lives in `src/repos.config.ts`. There is no separate config file or env var schema doc. If a plan doc or learned doc names a constant value and it conflicts with `src/repos.config.ts`, trust the source file.

This is not stated anywhere in ADR-001 or CLAUDE.md.

### 3. `docs/learned/` entries decay quickly — always trust `src/` when there is a conflict

Plan docs and learned docs are written at a point in time and can be stale within a single sprint (as happened with the Hono → NestJS swap). The rule: when a doc says X and the code says Y, the code wins. Update the doc, not the code.

## What a New Team Member Should Know

- Before reading `replace-polling-with-webhook.md`, know that its HTTP framework section is obsolete. Read `nestjs-raw-body-webhook-implementation.md` for the current stack.
- To understand what constants control behavior, open `src/repos.config.ts` first — it is the single configuration file.
- `docs/learned/` is a runbook companion to ADR-001, but entries can be stale. When in doubt, `grep` the source.

## Docs & Info That Would Speed Things Up Next Time

- `src/repos.config.ts` — all tunable constants (states, workspace path, repo list, max turns).
- `docs/learned/nestjs-raw-body-webhook-implementation.md` — current webhook implementation (NestJS).
- `docs/adr/ADR-001-webhook-driven-agent-architecture.md` — authoritative architecture spec; read before any `docs/learned/` entry.
