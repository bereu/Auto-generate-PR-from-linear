# Agent Execution Plan: fix-agent-complete-comment

## 1. Plan Overview

The completion comment `"Agent completed implementation. Review the linked PR."` is posted after `runClaude` succeeds, but no PR URL is embedded — the phrase "linked PR" points to nothing. The fix is to fetch the actual PR URL for the work branch immediately after Claude finishes and include it in the comment body.

## 2. Why It Is Needed

Reviewers need a direct link to the PR from the Linear issue. Currently they have to open GitHub separately and find the PR themselves. Including the real URL makes the issue self-contained and speeds up review.

## 3. MagicNumber / Status design

**AGENT_MESSAGES change** (`src/constants/message/success/agent.message.ts`)

```typescript
export const AGENT_MESSAGES = {
  agentStarting: "Agent starting implementation",
  agentComplete: (prUrl: string) => `Agent completed implementation. Review the PR: ${prUrl}`,
  agentSuspended: "Agent suspended (max turns reached)",
} as const;
```

> Note: `agentComplete` becomes a function so the PR URL can be injected at call time.

## 4. Action List

- [x] Change `agentComplete` in `src/constants/message/success/agent.message.ts` from a plain string to an arrow function `(prUrl: string) => \`Agent completed implementation. Review the PR: ${prUrl}\``
- [x] Add `fetchPrUrl(repoFullName: string, branch: string): Promise<string | null>` to `src/transfer/linear.transfer.ts` — NO, wrong layer. This is GitHub data. Add a `GithubTransfer` or use a util.
  - Actually: use `execSync` in a new `src/util/github.ts` pure util — `gh pr list --repo <repo> --head <branch> --json url --jq '.[0].url'` returns the PR URL as a string. Wrap in try/catch, return `null` if not found.
- [x] In `agent.ts` `processIssue()`: after `markReadyForReview`, call `fetchPrUrl(repoFull, workBranch)` to get the URL, then post `AGENT_MESSAGES.agentComplete(prUrl ?? "(PR not found)")` as the comment
- [x] Unit test: mock `execSync`, assert `fetchPrUrl` returns correct URL and handles missing PR gracefully
- [x] Update any tests that assert the old `agentComplete` string value

## 5. AC (Acceptance Criteria)

- [x] Linear completion comment reads `"Agent completed implementation. Review the PR: https://github.com/org/repo/pull/N"`
- [x] If PR is not found (e.g. Claude failed before `gh pr create`), comment reads `"Agent completed implementation. Review the PR: (PR not found)"` — does not throw
- [x] `npm run test` passes
