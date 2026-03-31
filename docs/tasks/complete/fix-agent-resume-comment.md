# Agent Execution Plan: fix-agent-resume-comment

## 1. Plan Overview

When the agent fails mid-run and the issue is reset to "Todo" and re-triggered, `processIssue` always posts "Agent starting implementation". This means the Linear issue accumulates multiple identical comments on each retry, making it impossible to tell whether the agent is starting fresh or resuming after a failure.

Fix: before posting the start comment, fetch the issue's existing comments. If an "Agent starting implementation" comment already exists, post "Agent resuming implementation" instead.

## 2. Why It Is Needed

During regression testing, PER-17 accumulated three "Agent starting implementation" comments after two failures + one success. Observers cannot tell from the issue timeline whether an attempt is a fresh start or a retry. The "Agent resuming implementation" comment makes the lifecycle readable at a glance.

## 3. MagicNumber / Status design

**AGENT_MESSAGES addition** (`src/constants/message/success/agent.message.ts`)

```typescript
export const AGENT_MESSAGES = {
  agentStarting: "Agent starting implementation",
  agentResuming: "Agent resuming implementation",
  agentComplete: "Agent completed implementation.",
  agentSuspended: "Agent suspended (max turns reached)",
} as const;
```

## 4. Action List

- [ ] Add `agentResuming: "Agent resuming implementation"` to `AGENT_MESSAGES` in `src/constants/message/success/agent.message.ts`
- [ ] Add `fetchComments(issueId: string): Promise<string[]>` to `LinearTransfer` — calls `client.issue(issueId)` then `issue.comments()`, returns array of comment bodies
- [ ] Add `hasStartingComment(issueId: string): Promise<boolean>` to `IssueRepository` — delegates to `transfer.fetchComments`, returns true if any body equals `AGENT_MESSAGES.agentStarting`
- [ ] In `agent.ts` `processIssue()`: replace the hardcoded `AGENT_MESSAGES.agentStarting` comment with a conditional — call `issueRepository.hasStartingComment(issueId)`, post `agentResuming` if true, `agentStarting` if false
- [ ] Unit test `LinearTransfer.fetchComments` — mock `client.issue` and `issue.comments`, assert correct bodies returned
- [ ] Unit test `IssueRepository.hasStartingComment` — test true/false branches

## 5. AC (Acceptance Criteria)

- [ ] First run of an issue → Linear comment reads "Agent starting implementation"
- [ ] Retry run after failure → Linear comment reads "Agent resuming implementation"
- [ ] No duplicate "Agent starting implementation" on retries
- [ ] `npm run test` passes
