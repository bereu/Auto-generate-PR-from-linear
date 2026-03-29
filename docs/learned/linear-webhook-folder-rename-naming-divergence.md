# What I Learned: Linear-Webhook Folder Rename — Planned vs. Actual Naming

**Date:** 2026-03-27

## What I Learned This Session

### 1. Infrastructure container vs. business service: split naming is accepted

The plan in `adr-compliance-refactor-layer-domain.md` (written the same session) described the rename as:

| Item          | Planned                | Actually implemented      |
| ------------- | ---------------------- | ------------------------- |
| Folder        | `src/issue-event/`     | `src/linear-webhook/`     |
| Controller    | `IssueEventController` | `LinearWebhookController` |
| Module        | `IssueEventModule`     | `LinearWebhookModule`     |
| Service class | `IssueEventService`    | `IssueEventService` ✓     |

The folder, controller, and module kept a technology-qualified name (`linear-webhook`). Only the service class was given a business-meaningful name (`IssueEventService`).

**The implicit rule:** When a folder is purely infrastructure (it only receives HTTP calls and delegates to the command layer), a vendor-prefixed transport name (`linear-webhook`) is acceptable. The business name must live in the _service_ class, because the service is where domain-relevant decisions could exist. The controller/module/folder are pure wiring — they do not express business intent.

### 2. File name and class name can intentionally diverge

`src/linear-webhook/linear-webhook.service.ts` exports `IssueEventService`:

```typescript
// File: linear-webhook.service.ts
export class IssueEventService { ... }
```

The file is named after the transport mechanism; the class is named after the business event it handles. This is not an accident. The file name describes _where in the HTTP stack_ the code lives; the class name describes _what business operation_ the code coordinates.

This pattern appears when a service straddles infrastructure (must live next to its controller/module) and business semantics (the class logic is event-driven). In this project, this divergence is allowed.

### 3. `linear-` prefix qualifies the vendor, not the business concept

`LinearWebhookController` means "the controller that handles Linear's webhook HTTP endpoint". The prefix disambiguates this from a hypothetical `GitHubWebhookController` — it is a vendor qualifier, not a business concept.

Contrast with the wrong pattern that was replaced: `WebhookController` (no qualifier) was wrong because it was ambiguous and non-business. `LinearWebhookController` is accepted because it is precise infrastructure identity.

### 4. `IssueEventService` lives inside `src/linear-webhook/` — the folder does not own the class name

A reader looking at `src/linear-webhook/` expects `LinearWebhookService`. Finding `IssueEventService` inside is surprising. The reason: the service was renamed to its business name first, then the folder was renamed to match transport, creating a mismatch.

If the folder is renamed again to `src/issue-event/`, all four names would align. For now, the split is stable but non-obvious.

## What a New Team Member Should Know

- **The folder `src/linear-webhook/` is infrastructure-only.** Don't add business logic here. Route through `ImplementIssueCommand` instead.
- **`IssueEventService` is in `linear-webhook.service.ts`** — not in `issue-event.service.ts`. The grep for `IssueEventService` finds it at `src/linear-webhook/linear-webhook.service.ts`.
- **`LinearWebhookController`, `LinearWebhookModule`, `LinearWebhookService` are valid names** in this project only because they are 100% infrastructure containers. If any business decision ever enters them, they must be renamed to a business concept.
- **The `adr-compliance-refactor-layer-domain.md` doc describes `issue-event/` as the target name**, but the actual code uses `linear-webhook/`. The doc reflects the ideal; the code reflects the accepted pragmatic state.

## Docs & Info That Would Speed Things Up Next Time

- `docs/learned/adr-compliance-refactor-layer-domain.md` §1 — the originally planned folder rename to `issue-event/` and why it was proposed.
- `src/linear-webhook/linear-webhook.service.ts` — see `IssueEventService` class inside a technology-named file: the split naming pattern in practice.
- `docs/adr/BE-001-layer-architecture.md` — naming rule: business concepts, not transport names. This session shows the edge case where transport names are tolerated for infrastructure containers.
