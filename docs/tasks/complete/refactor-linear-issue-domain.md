# Agent Execution Plan: refactor-linear-issue-domain

## 1. Plan Overview

Convert the plain `LinearIssue` interface into a proper Domain class following BE-002 (Domain Rules) and BE-005 (Value Domain Rules). Introduce Value Domain objects for `IssueId` and `IssueTitle`. The Domain class must be immutable, self-validating, and expose only getter methods.

## 2. Why It Is Needed

ADR BE-002 requires all domain objects to be Domain classes with private fields, public getters, and self-validation in the constructor. ADR BE-005 requires business-critical primitives (like IDs and titles) to be wrapped in Value Domain objects.

Currently `LinearIssue` is a plain interface with no validation — an invalid issue (empty id or title) can exist in memory without error.

ADR BE-001 naming rule: names must reflect business logic.

- **Good**: `IssueId`, `IssueTitle`, `LinearIssue`, `hasLabel`, `isAgentIssue`
- **Avoid**: `LinearIssueInterface`, `IssueDTO`, `IssueModel`

## 3. MagicNumber / Status design

No new statuses. Existing `LINEAR_STATES` const object covers state management.

```typescript
// Value Domain: IssueId (business identity)
export class IssueId {
  private constructor(private readonly _value: string) {}
  static of(id: string): IssueId { ... }   // validate non-empty
  value(): string { return this._value; }
}

// Value Domain: IssueTitle (business display name)
export class IssueTitle {
  private constructor(private readonly _value: string) {}
  static create(title: string): IssueTitle { ... }  // validate non-empty
  value(): string { return this._value; }
  withSuspendPrefix(): IssueTitle { ... }  // derivation: "[SUSPEND] {title}"
}

// Domain: LinearIssue
export class LinearIssue {
  private constructor(
    private readonly _id: IssueId,
    private readonly _title: IssueTitle,
    private readonly _description: string | null,
    private readonly _url: string,
    private readonly _labels: string[],
  ) {}
  static reconstruct(...): LinearIssue { ... }
  id(): IssueId { ... }
  title(): IssueTitle { ... }
  description(): string | null { ... }
  url(): string { ... }
  labels(): string[] { ... }
  hasLabel(label: string): boolean { ... }         // derivation
  isAgentIssue(agentLabel: string): boolean { ... } // derivation
}
```

## 4. Action List

- [x] Create `src/issue/domain/value/issue-id.ts` — Value Domain for issue identity (validates non-empty string)
- [x] Create `src/issue/domain/value/issue-title.ts` — Value Domain for issue title (validates non-empty string, has `withSuspendPrefix()` derivation)
- [x] Create `src/issue/domain/linear-issue.ts` — Domain class with:
  - Private constructor, all properties via Value Domains
  - `static reconstruct(...)` factory (for data loaded from Linear API)
  - Only getter methods, no setters
  - `hasLabel(label: string): boolean` and `isAgentIssue(agentLabel: string): boolean` derivation methods
- [x] Remove the `LinearIssue` interface from `src/linear.ts`, re-export the Domain class
- [x] Update `src/agent.ts` — use Domain getters (`.id().value()`, `.title().value()`)
- [x] Update `src/webhook/webhook.service.ts` — construct `LinearIssue` via `LinearIssue.reconstruct()`
- [x] Update `src/webhook/webhook.service.test.ts` — use Domain getter methods in assertions

## 5. AC (Acceptance Criteria)

- [x] `LinearIssue` is a Domain class with private constructor, getters only, and no setters
- [x] `IssueId` and `IssueTitle` are Value Domain classes with `_value` private field and `.value()` getter
- [x] `IssueTitle.withSuspendPrefix()` returns a new `IssueTitle` with `[SUSPEND]` prepended (immutable)
- [x] Constructing with an empty id or empty title throws an error
- [x] `npm run test` passes
- [x] `npm run lint` passes
