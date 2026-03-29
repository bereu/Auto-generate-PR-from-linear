# What I Learned: BE-001 Naming — Entry-Point Files and Generic Verbs

**Date:** 2026-03-27

## What I Learned This Session

### 1. BE-001 applies to file names, not just class/service names

`agent.ts` violates BE-001 because it is named after its system role ("the agent") rather than the business action it performs ("implement an issue").

The correct file name is `implement-issue.ts`.

The rule: every file name must reflect what business action the file performs, just as class and service names must. System-role names (`agent`, `runner`, `handler`, `worker`, `processor`) are technical infrastructure names and violate BE-001 for files.

### 2. "process" is a generic technical verb — it is a BE-001 violation

`processIssue` uses "process" as the verb. "Process" describes what the system does mechanically, not what the business does. It is in the same category as forbidden names like `handle`, `run`, `execute`, `manage`.

The correct function name is `implementIssue`.

Rule: the verb in a function name must be the specific business verb. Generic system verbs (`process`, `handle`, `run`, `execute`, `manage`, `do`) are always wrong when the business has a precise word for the action.

| Generic (wrong)  | Business-specific (correct) |
| ---------------- | --------------------------- |
| `processIssue`   | `implementIssue`            |
| `handleWebhook`  | `receiveEvent`              |
| `runAgent`       | `implementIssue`            |
| `executeCommand` | depends on command          |

### 3. Test mocks and imports track the file name — rename all three together

When `agent.ts` is renamed to `implement-issue.ts` and `processIssue` is renamed to `implementIssue`, three things must change simultaneously:

1. The file: `src/agent.ts` → `src/implement-issue.ts`
2. All importers (e.g., `src/issue/command/implement-issue.command.ts`)
3. Test mocks: `jest.mock("@/agent.ts")` and any reference to `processIssue` inside the test

Failing to update all three causes a runtime module-not-found error or a test that mocks the wrong path.

## What a New Team Member Should Know

- **File names must use business-action names**, not system-role names. `agent.ts`, `worker.ts`, `processor.ts` are all invalid in this project.
- **Generic verbs are BE-001 violations.** If you catch yourself writing `processX`, `handleX`, or `runX`, stop and name the actual business verb.
- **Renaming a file means updating tests and mocks too.** In this project tests mock by file path (`"@/agent.ts"`), so a file rename breaks the mock silently if the import path is not updated.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/BE-001-layer-architecture.md` — the naming rule: "names must reflect business logic, not system/technical concerns." The examples show class/service names, but the same rule applies to files and functions.
- `docs/learned/adr-refactor-plan-creation-naming-patterns.md` — see §5 for class-level BE-001 naming (covers `WebhookService → IssueEventService`). This doc extends that to files and function verbs.
