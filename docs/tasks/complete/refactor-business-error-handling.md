# Agent Execution Plan: Add Business Error Handling to Create Issue → Create PR Flow

## 1. Plan Overview

Add structured business error handling (per `BE-003`) to the `processIssue()` flow in `agent.ts`. Currently the catch block treats all errors identically: log + reset to pending. This causes two concrete bugs and violates BE-003's requirement to distinguish business errors from system errors.

## 2. Why It Is Needed

Per `BE-003`:

- Business errors (impossible-but-valid-workflow states) must NOT be swallowed as system errors.
- Every error must include relevant properties for Rollbar.
- Custom error classes must represent specific business logic failures.

**Concrete bugs today:**

1. `maxTurnsReached` — `runClaude()` already calls `suspendIssue.suspend()` (sets Linear state to Suspended), then throws. The catch block then calls `issueRepository.resetToPending()`, **overwriting the Suspended state** with Todo. The suspend is silently undone.
2. `UnknownRepo` — if an issue has an unrecognized repo label, resetting to pending is wrong: it will re-trigger the agent in an infinite loop. This is a business misconfiguration, not a transient error.
3. `ClaudeTerminated` — when Claude Code exits mid-run (cost limit exceeded, process killed, SDK-level abort), the `query()` loop ends but `result` remains `null`. Currently thrown as a generic system error and reset to pending — causing the agent to re-run and hit the same limit again.

## 3. Error Classification

| Error scenario                                          | Class                   | Linear action                                             | Rollbar |
| ------------------------------------------------------- | ----------------------- | --------------------------------------------------------- | ------- |
| Repo label not in REPOS config                          | `UnknownRepoError`      | Add comment, leave in current state                       | warn    |
| Claude hit max turns                                    | `MaxTurnsReachedError`  | Already suspended by `SuspendIssueCommand` — do NOT reset | warn    |
| Claude terminated (cost limit, process kill, SDK abort) | `ClaudeTerminatedError` | Add comment, suspend issue — do NOT reset to pending      | warn    |
| Linear API failure                                      | system Error            | Add comment, reset to pending                             | error   |
| Git/worktree failure                                    | system Error            | Add comment, reset to pending                             | error   |
| All other unexpected errors                             | system Error            | Add comment, reset to pending                             | error   |

## 4. Design

### 4.1 Custom Error Classes

Create `src/constants/errors/business.error.ts`:

```typescript
export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly properties: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export class UnknownRepoError extends BusinessError {
  constructor(issueId: string, repoLabel: string) {
    super(`Unknown repo label: ${repoLabel}`, { issueId, repoLabel });
    this.name = "UnknownRepoError";
  }
}

export class MaxTurnsReachedError extends BusinessError {
  constructor(issueId: string) {
    super("Claude max turns reached", { issueId });
    this.name = "MaxTurnsReachedError";
  }
}

export class ClaudeTerminatedError extends BusinessError {
  constructor(issueId: string) {
    super("Claude terminated unexpectedly (cost limit or process kill)", { issueId });
    this.name = "ClaudeTerminatedError";
  }
}
```

### 4.2 Throw Points

- `agent.ts` `processIssue()`: replace `throw new Error(\`Unknown repo: ${repoName}\`)`with`throw new UnknownRepoError(issueId, repoLabel)`
- `agent.ts` `runClaude()`: replace generic `throw new Error(SYSTEM_ERRORS.maxTurnsReached)` with `throw new MaxTurnsReachedError(issue.id().value())`
- `agent.ts` `runClaude()`: replace `if (!result) throw new Error(SYSTEM_ERRORS.claudeNoResponse)` with `if (!result) throw new ClaudeTerminatedError(issue.id().value())`

### 4.3 Updated catch block in `processIssue()`

```typescript
} catch (err) {
  if (err instanceof MaxTurnsReachedError) {
    // Already suspended by SuspendIssueCommand — do NOT reset to pending
    logger.warn(`  ⚠️  [${issueId}] Max turns reached: ${err.message}`);
    // TODO: rollbar.warn(err, err.properties)
  } else if (err instanceof ClaudeTerminatedError) {
    // Claude exited mid-run (cost limit, process kill, SDK abort)
    // Suspend so it doesn't re-trigger and hit the same limit again
    logger.warn(`  ⚠️  [${issueId}] Claude terminated: ${err.message}`);
    await suspendIssue.suspend(issue).catch(() => {});
    await issueRepository
      .addComment(issueId, AGENT_MESSAGES.agentTerminated)
      .catch(() => {});
    // TODO: rollbar.warn(err, err.properties)
  } else if (err instanceof UnknownRepoError) {
    // Misconfiguration — resetting to pending causes infinite loop
    logger.warn(`  ⚠️  [${issueId}] Business error: ${err.message}`);
    await issueRepository
      .addComment(issueId, `Agent stopped: ${err.message}`)
      .catch(() => {});
    // TODO: rollbar.warn(err, err.properties)
  } else {
    // System error — comment to notify, then reset to pending so human can retry
    logger.error(`  ❌ [${issueId}] System error: ${(err as Error).message}`);
    await issueRepository
      .addComment(issueId, AGENT_MESSAGES.agentFailed((err as Error).message))
      .catch(() => {});
    await issueRepository.resetToPending(issueId).catch(() => {});
    // TODO: rollbar.error(err, { issueId })
  }
  throw err;
}
```

## 5. Action List

- [x] Create `src/constants/errors/business.error.ts` with `BusinessError`, `UnknownRepoError`, `MaxTurnsReachedError`, `ClaudeTerminatedError`
- [x] Add `AGENT_MESSAGES.agentTerminated` and `AGENT_MESSAGES.agentFailed` constants to `src/constants/message/success/agent.message.ts`
  - `agentTerminated`: `"Agent terminated unexpectedly (cost limit or process interruption). Manual review required."`
  - `agentFailed`: `(reason: string) => \`Agent failed with system error: ${reason}. Issue reset to pending.\``
  - Note: `MaxTurnsReachedError` comment is already covered by `suspendIssue.suspend()` which posts `AGENT_MESSAGES.agentSuspended`
- [x] In `agent.ts` `processIssue()`: throw `UnknownRepoError` instead of generic Error for unknown repo
- [x] In `agent.ts` `runClaude()`: throw `MaxTurnsReachedError` instead of generic Error for max turns
- [x] In `agent.ts` `runClaude()`: throw `ClaudeTerminatedError` when `!result` (instead of generic `claudeNoResponse` Error)
- [x] Update catch block in `processIssue()` to branch on error type per the design above
- [x] Pass `suspendIssue` into catch scope so `ClaudeTerminatedError` branch can call `suspendIssue.suspend(issue)`
- [x] Add unit test for `processIssue()` catch-block branching:
  - `MaxTurnsReachedError` → does NOT call `resetToPending`
  - `ClaudeTerminatedError` → calls `suspendIssue.suspend`, calls `addComment`, does NOT call `resetToPending`
  - `UnknownRepoError` → does NOT call `resetToPending`, calls `addComment`
  - Generic `Error` → calls `addComment` with `agentFailed`, then calls `resetToPending`
- [x] Run `npm run test` and `npm run lint`

## 6. AC (Acceptance Criteria)

- [ ] `src/constants/errors/business.error.ts` exists with all four error classes
- [ ] `MaxTurnsReachedError` thrown → Linear state stays Suspended (not reset to pending)
- [ ] `ClaudeTerminatedError` thrown → issue suspended, comment added with termination message, not reset to pending
- [ ] `UnknownRepoError` thrown → comment added to issue, state not changed, no infinite loop
- [ ] Generic system errors → comment added with error reason + state reset to pending
- [ ] All error branches post a comment to Linear notifying the user
- [ ] All error branches log with appropriate level (warn vs error)
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
