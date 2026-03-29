# Agent Execution Plan: refactor-layer-architecture

## 1. Plan Overview

Refactor the backend to follow BE-001 layer architecture. The current `WebhookService` is named after a technical system concern and bundles signature verification, issue filtering, and agent dispatching into one place. The `agent.ts` `processIssue` also mixes issue state transitions with infrastructure. This plan introduces proper Command and Repository layers with business-meaningful names.

## 2. Why It Is Needed

ADR BE-001 requires:

- **Controller** — maps requests only; no business logic
- **Command** — executes write/modification operations; named after business actions
- **Repository** — domain-unit access; method names reflect business intent
- **Transfer** — wraps external service calls

ADR BE-001 naming rule: names must reflect **business logic**, not system/technical concerns.

- **Good**: `implementIssue`, `suspendIssue`, `markInReview`
- **Avoid**: `processWebhook`, `handlePayload`, `executeService`, `WebhookService`

Currently:

- `WebhookService` — technical name; contains business filtering logic that belongs in a Command
- `processIssue` in `agent.ts` — directly calls Linear without a Repository/Transfer boundary
- `updateIssueState` in `linear.ts` — technical CRUD name instead of a business action name

## 3. MagicNumber / Status design

No new magic values needed. Existing `LINEAR_STATES` and `LINEAR_LABEL` constants are sufficient.

```typescript
// LINEAR_STATES (already defined — no change)
export const LINEAR_STATES = {
  todo: "Todo",
  inProgress: "In Progress",
  inReview: "In Review",
  suspended: "Suspended",
} as const;
```

## 4. Action List

- [ ] Create `src/issue/command/implement-issue.command.ts` (`ImplementIssueCommand`)
  - Move all business filtering from `WebhookService`: check issue type, trigger actions, agent label, Todo state
  - Construct `LinearIssue` domain, call agent dispatch
  - Method: `execute(rawBody: Buffer, signature: string): void`
- [ ] Create `src/issue/command/suspend-issue.command.ts` (`SuspendIssueCommand`)
  - Handles max-turns suspension: prefix title with `[SUSPEND]`, set state to Suspended
  - Extracted from `runClaude` in `agent.ts`
  - Method: `execute(issue: LinearIssue): Promise<void>`
- [ ] Create `src/issue/repository/issue.repository.ts` (`IssueRepository`)
  - Wraps all Linear state-change operations with business-named methods:
    - `startImplementation(id)` — sets state to In Progress
    - `markReadyForReview(id)` — sets state to In Review
    - `suspend(id)` — sets state to Suspended
    - `updateTitle(id, title)` — updates issue title
    - `findAgentIssues()` — fetches issues with agent label in Todo state
- [ ] Create `src/issue/transfer/linear.transfer.ts` (`LinearTransfer`)
  - Wraps raw `LinearClient` calls; no business logic, only data mapping
  - `IssueRepository` delegates to `LinearTransfer`
- [ ] Rename `src/webhook/webhook.service.ts` → `src/webhook/issue-event.service.ts` (`IssueEventService`)
  - Keeps only `verifySignature` as a private helper
  - Delegates to `ImplementIssueCommand`
- [ ] Update `src/webhook/webhook.controller.ts` — inject `IssueEventService`
- [ ] Update `src/webhook/webhook.module.ts` — register new providers
- [ ] Refactor `src/agent.ts` — delegate state transitions to `IssueRepository`; delegate suspension to `SuspendIssueCommand`
- [ ] Migrate `src/linear.ts` logic into `LinearTransfer` + `IssueRepository`; remove file once migrated

## 5. AC (Acceptance Criteria)

- [x] No class or method named after a technical/system concern (`WebhookService`, `processWebhook`, `handlePayload`, etc.)
- [x] Business logic for issue filtering lives in `ImplementIssueCommand`
- [x] `IssueRepository` method names reflect business actions (`startImplementation`, `markReadyForReview`, `suspend`)
- [x] `LinearClient` is only instantiated inside `LinearTransfer`
- [x] `npm run test` passes
- [x] `npm run lint` passes
