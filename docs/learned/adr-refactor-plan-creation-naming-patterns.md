# What I Learned: ADR Refactor Plan Creation and Naming Patterns

**Date:** 2026-03-27

## What I Learned This Session

This session involved reading ADRs against the existing codebase and creating 3 execution plans. The non-obvious rules encountered:

### 1. GEN-001 (Magic Strings) applies to the test layer too

Tests that use raw string literals like `"Todo"`, `"In Progress"`, `"agent"`, `"Issue"` violate GEN-001 — even though they never run in production. The rule requires importing `LINEAR_STATES`, `LINEAR_LABEL`, and event type constants in tests.

If a constant is renamed in production, tests using raw strings diverge silently: they still compile and pass, but no longer test the real value.

**Rule:** Any file that references a status, label, or event type must import the constant. No exceptions for test files.

### 2. Constant names must reflect business meaning, not system/infrastructure

`WEBHOOK_TYPE_ISSUE` and `WEBHOOK_ACTIONS` are technical names — they describe the webhook infrastructure. BE-001 requires renaming to business names:

- `WEBHOOK_TYPE_ISSUE` → `ISSUE_EVENT_TYPE` (what kind of event, in business terms)
- `WEBHOOK_ACTIONS` → `ISSUE_TRIGGER_ACTIONS` (what actions trigger a business response)

The rename is not cosmetic. It signals to the reader what the constant controls in the business domain. Infrastructure-named constants cause confusion when business logic changes — developers don't know if the constant belongs to the system layer or the domain layer.

### 3. Domain class factory method: `reconstruct()` vs `of()` / `create()`

When building Domain classes, factory method naming depends on the data source:

| Method                    | Used when                             | Example                                   |
| ------------------------- | ------------------------------------- | ----------------------------------------- |
| `static of(value)`        | Value Domain wrapping a primitive     | `IssueId.of("LIN-123")`                   |
| `static create(value)`    | Value Domain with richer validation   | `IssueTitle.create("Fix bug")`            |
| `static reconstruct(...)` | Domain loaded from an external system | `LinearIssue.reconstruct(rawApiResponse)` |

`reconstruct()` is the signal that the data is trusted (already validated when originally created), not fresh user input. Using `create()` or `of()` for API responses implies unnecessary re-validation. This distinction is not explicitly named in BE-002 or BE-005 — it's inferred from the pattern.

### 4. Identifying the plan boundary: one violation = one plan

Three ADR violations were found in the codebase:

- GEN-001 violation: magic strings in tests → plan: `fix-magic-strings-in-tests`
- BE-002 + BE-005 violation: `LinearIssue` is a plain interface → plan: `refactor-linear-issue-domain`
- BE-001 violation: `WebhookService` is misnamed and mislocated → plan: `refactor-layer-architecture`

Each plan maps to one primary ADR. Bundling all three into a single plan would create unclear acceptance criteria and harder rollback. The rule: scope each plan to the violations of a single ADR, even if the files overlap.

### 5. `WebhookService` violates BE-001 naming: services should be named after business events

BE-001's naming rule is: names must reflect business logic, not system/technical concerns.

`WebhookService` is named after the transport protocol (webhook). The business event it handles is "a Linear issue was created or updated." Correct name: `IssueEventService`.

The same logic applies to any class named after infrastructure (e.g., `SlackService`, `HttpService`): if it contains business logic, rename it to describe what business event it serves.

## What a New Team Member Should Know

- **Test files must use the same constants as production code.** Never write `"Todo"` directly in a test — use `LINEAR_STATES.todo`.
- **If a constant name sounds like infrastructure, it probably needs renaming.** `WEBHOOK_*` constants belong in the infrastructure layer only. Business-layer code uses business-named constants.
- **`reconstruct()` = trusted external data. `of()` / `create()` = input validation.** Use `reconstruct()` for Domain objects built from API responses.
- **One plan per ADR violation.** Don't bundle unrelated ADR violations into one execution plan — they have different acceptance criteria and different files.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/BE-001-layer-architecture.md` — naming rules section: "names must reflect business logic, not system/technical concerns." Read this before naming any class.
- `docs/adr/BE-002-manage-data-domain.md` — Domain class structure: private constructor, getters only, no setters.
- `docs/adr/BE-005-value-domain.md` — Value Domain structure and factory method patterns.
- `docs/adr/GEN-001-magic-number-and-status-management.md` — applies to test files; do not skip.
- `src/repos.config.ts` — all defined constants: `LINEAR_STATES`, `LINEAR_LABEL`, `MAX_TURNS`.
