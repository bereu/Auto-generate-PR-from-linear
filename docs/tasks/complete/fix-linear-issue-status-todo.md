# Agent Execution Plan: fix-linear-issue-status-todo

## 1. Plan Overview

When `CreateLinearIssueCommand` creates a Linear issue from a Slack bug report, the issue may land in a non-"Todo" state (workspace default). The webhook pipeline checks `state.name === LINEAR_STATES.todo` and silently skips issues not in that state — meaning the agent never runs.

## 2. Why It Is Needed

Issues created from Slack must land in "Todo" so the Linear webhook triggers agent implementation. Without explicit state assignment, the workspace default (which may differ) causes the pipeline to silently drop the event.

## 3. MagicNumber / Status design

No new constants needed. Reuses existing:

```typescript
LINEAR_STATES.todo = "Todo"; // src/repos.config.ts
```

## 4. Action List

- [ ] In `src/transfer/linear.transfer.ts`: add `stateName?: string` to `createIssue()` params; after resolving labels, if `stateName` is provided fetch team states, resolve `stateId`, and include it in `client.createIssue()` payload
- [ ] In `src/slack-bug-intake/command/create-linear-issue.command.ts`: pass `stateName: LINEAR_STATES.todo` to `linearTransfer.createIssue()`

## 5. AC (Acceptance Criteria)

- [ ] Created Linear issue lands in "Todo" state
- [ ] Webhook pipeline detects and processes the new issue
