# What I Learned: Command Method Naming — Never Use `execute()`

**Date:** 2026-03-27

## What I Learned This Session

### Command classes must NOT have a generic `execute()` method

When implementing Command classes, the public method must be named after the business action it performs — not after the technical pattern.

**Wrong:**

```typescript
class ImplementIssueCommand {
  execute(payload: RawWebhookPayload): void { ... }
}

class SuspendIssueCommand {
  async execute(issue: LinearIssue): Promise<void> { ... }
}
```

**Correct:**

```typescript
class ImplementIssueCommand {
  implement(payload: RawWebhookPayload): void { ... }
}

class SuspendIssueCommand {
  async suspend(issue: LinearIssue): Promise<void> { ... }
}
```

This is an extension of the BE-001 naming convention to Command method names specifically. The ADR says "names must reflect business logic" — this applies to method names on Command classes, not just class/variable names.

### Why `execute()` is wrong here

`execute()` is a name that describes the technical pattern (the Command Pattern from GoF). It tells you _nothing_ about what the command does. When reading call sites like `this.implementIssue.execute(payload)`, the intent is obscured. With `this.implementIssue.implement(payload)`, the intent is clear.

The rule: the Command class name names the business action noun (`ImplementIssue`), and the method names the business action verb (`implement()`). Together they read as: "implement an issue."

### This applies to ALL commands in the project

Any `execute()`, `run()`, `handle()`, or other generic method on a Command class violates this rule. Rename to the business verb:

| Command Class           | Correct method name   | Reason                               |
| ----------------------- | --------------------- | ------------------------------------ |
| `ImplementIssueCommand` | `implement()`         | Business verb: "implement the issue" |
| `SuspendIssueCommand`   | `suspend()`           | Business verb: "suspend the issue"   |
| Any future `XyzCommand` | `xyz()` or equivalent | Always match the business action     |

### The rename was caught via test suite, not linting

There is no lint rule that flags `execute()` on Command classes. The only enforcement is code review. When you see a Command class with `execute()`, treat it as a lint violation and rename it before merging.

## What a New Team Member Should Know

- **Never name a Command method `execute()`** — always use the business verb.
- The test file will tell you what method names are expected: `webhook.service.test.ts` calls `.implement()` and `.suspend()` directly. If the method name is wrong, tests will fail.
- The ADR `BE-001` naming section covers this implicitly but does not show a Command example explicitly. The convention is inferred from the "Good/Avoid" examples.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/BE-001-layer-architecture.md` — naming convention section: "We prioritize naming that reflects business logic." Apply this to Command method names.
- `src/issue/command/implement-issue.command.ts` — reference implementation showing `.implement()`.
- `src/issue/command/suspend-issue.command.ts` — reference implementation showing `.suspend()`.
