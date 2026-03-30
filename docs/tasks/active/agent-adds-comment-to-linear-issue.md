# Agent Execution Plan: agent-adds-comment-to-linear-issue

## 1. Plan Overview

When the agent works on a Linear issue there is no visibility into progress. Adding lifecycle comments ("starting", "complete", "suspended") lets the team see what the agent is doing directly in Linear without checking server logs.

## 2. Why It Is Needed

Without comments, it is impossible to tell from the Linear UI whether the agent started, finished, or got stuck. Comments provide real-time status visibility.

## 3. MagicNumber / Status design

```typescript
// src/constants/message/error/system.error.ts (add)
linearCommentFailed: "Linear comment creation failed";

// src/constants/message/success/agent.message.ts (new file)
export const AGENT_MESSAGES = {
  agentStarting: "Agent starting implementation",
  agentComplete: "Agent completed implementation. Review the linked PR.",
  agentSuspended: "Agent suspended (max turns reached)",
} as const;
```

## 4. Action List

- [ ] Add `linearCommentFailed` to `SYSTEM_ERRORS` in `src/constants/message/error/system.error.ts`
- [ ] Create `src/constants/message/success/agent.message.ts` with `AGENT_MESSAGES`
- [ ] Add `createComment(issueId: string, body: string): Promise<void>` to `src/transfer/linear.transfer.ts`
- [ ] Add `addComment(issueId: string, body: string): Promise<void>` to `src/linear-webhook/repository/issue.repository.ts`
- [ ] In `src/agent.ts`: call `addComment` with `AGENT_MESSAGES.agentStarting` before `startImplementation` (wrapped in `.catch(() => {})`)
- [ ] In `src/agent.ts`: call `addComment` with `AGENT_MESSAGES.agentComplete` after `markReadyForReview` (wrapped in `.catch(() => {})`)
- [ ] In `src/linear-webhook/command/suspend-issue.command.ts`: call `addComment` with `AGENT_MESSAGES.agentSuspended` after `suspend()` (wrapped in `.catch(() => {})`)

## 5. AC (Acceptance Criteria)

- [ ] Linear issue receives comment "Agent starting implementation" when processing begins
- [ ] Linear issue receives comment "Agent completed implementation..." on success
- [ ] Linear issue receives comment "Agent suspended..." on max turns
