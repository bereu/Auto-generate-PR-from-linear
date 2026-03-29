# What I Learned: ADR Compliance Refactor — Layer Architecture and Domain

**Date:** 2026-03-27

## What I Learned This Session

### 1. Folder name must reflect business concept, not transport mechanism

`src/webhook/` is an infrastructure name. The business concept is "issue events" (Linear notifying us an issue changed). Even though `IssueEventService` was already correctly named, the folder/file names contradicted it:

- Folder: `src/webhook/` → should be `src/issue-event/`
- Files: `webhook.controller.ts`, `webhook.service.ts`, `webhook.module.ts` → `issue-event.*.ts`
- Classes: `WebhookController`, `WebhookModule` → `IssueEventController`, `IssueEventModule`

This is a specific application of BE-001 naming rule: **names must reflect business logic, not system/technical concerns.**

### 2. Constants used in tests must be exported from the service that owns them

When renaming constants to business-meaningful names (e.g., `WEBHOOK_TYPE_ISSUE` → `ISSUE_EVENT_TYPE`), those constants must be exported so tests can import them. If tests use raw strings like `"Issue"` or `"Todo"` directly, a constant rename silently diverges from production behavior.

The fix: export `ISSUE_EVENT_TYPE` and `ISSUE_TRIGGER_ACTIONS` from `src/webhook/webhook.service.ts` and import them in the test.

### 3. `linear.ts` at source root is a placeholder, not a proper layer

`src/linear.ts` held a single function `resolveRepo()` plus a `LinearIssue` re-export. This pattern — a file named after an external system sitting at the root — is not a recognized layer. The correct home is:

- Business logic (`resolveRepo`) → inline into `agent.ts` or move to domain
- `LinearClient` calls → `LinearTransfer` (transfer layer)

### 4. Layer architecture violation: `WebhookService` was doing three jobs

Before refactor, `WebhookService`:

- Verified HMAC signatures (infrastructure)
- Filtered issues by type/action/state/label (business logic — belongs in Command)
- Dispatched to the agent (also Command responsibility)

After refactor:

- `IssueEventService` — only verifies signature, delegates to `ImplementIssueCommand`
- `ImplementIssueCommand` — all business filtering and dispatch
- `IssueRepository` — business-named Linear state transitions (`startImplementation`, `markReadyForReview`, `suspend`)
- `LinearTransfer` — raw `LinearClient` calls, no business logic

### 5. Value Domain objects must be immutable via derivation methods

`IssueTitle.withSuspendPrefix()` returns a **new** `IssueTitle` — it does not mutate the original. This is the only correct pattern per BE-005: Value Domains have no setters; mutation is expressed as derivation returning a new instance.

## What a New Team Member Should Know

- If you see a folder named after a protocol or library (`webhook/`, `http/`, `linear/`), it is likely wrong. The folder name must reflect the business domain it serves.
- When adding a constant that will be used in tests, export it from the source file immediately — do not write raw strings in tests and come back later.
- `WebhookModule`/`WebhookController`/`WebhookService` are all flagged names in this project. Anything prefixed `Webhook` at the class level violates ADR BE-001.
- Commands own business filtering. Controllers own only request mapping. Never put `if (issue.type === "Issue" && issue.action === "update")` inside a Controller or Service.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/BE-001-layer-architecture.md` — defines Controller/Command/Repository/Transfer boundaries and naming rules
- `docs/adr/BE-002-manage-data-domain.md` — Domain class rules (private constructor, getters only, factory methods)
- `docs/adr/BE-005-value-domain.md` — Value Domain rules (immutability, derivation pattern)
- `docs/adr/GEN-001-magic-number-and-status-management.md` — no raw string literals; export constants for test use
