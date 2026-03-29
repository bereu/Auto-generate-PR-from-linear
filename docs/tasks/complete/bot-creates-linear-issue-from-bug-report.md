# Bot Creates Linear Issue from Complete Bug Report

## 1. Plan Overview

When `EvaluateBugReportCommand` determines the bug report is complete (Story 2), the bot uses the **Vercel AI SDK** (`generateObject`) to format the conversation into a structured Linear issue, then creates it via the existing `LinearTransfer`. The bot confirms in the Slack thread with a link to the created issue.

## 2. Why It Is Needed

Once all required information is gathered, the report needs to be turned into a Linear issue automatically. This closes the Slack → Linear intake loop and triggers the downstream agent pipeline (Linear webhook → Claude implements → PR).

## 3. Architecture

```
src/
  slack-bug-intake/
    command/
      create-linear-issue.command.ts   ← format + create Linear issue
  domain/
    bug-report/
      bug-report.ts                    ← BugReport domain (title + description)
```

### Format the issue with AI SDK

Use `generateObject` to extract a clean title and description from the raw conversation:

```typescript
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const { object } = await generateObject({
  model: anthropic("claude-haiku-4-5-20251001"),
  system: FORMAT_SYSTEM_PROMPT,
  messages: thread.messages,
  schema: z.object({
    title: z.string(), // concise one-line issue title
    description: z.string(), // markdown: summary, steps, expected, actual, env
  }),
});
```

### System prompt for formatting

```typescript
const FORMAT_SYSTEM_PROMPT = `
You are a bug report formatter. Given the conversation, produce:
- title: a concise one-line summary of the bug (max 80 chars)
- description: a well-structured markdown description with these sections:
  ## Summary
  ## Steps to Reproduce
  ## Expected Behaviour
  ## Actual Behaviour
  ## Environment
`;
```

### Create the Linear issue

Reuse the existing `LinearTransfer` (already in `src/transfer/linear.transfer.ts`):

```typescript
const issue = await linearTransfer.createIssue({
  title: object.title,
  description: object.description,
  labelNames: ["agent"], // triggers the downstream agent pipeline
});
```

### Confirm in Slack thread

```typescript
await thread.post(`Linear issue created: ${issue.url}`);
```

## 4. Domain

```typescript
// src/domain/bug-report/bug-report.ts
export class BugReport {
  private constructor(
    private readonly _title: string,
    private readonly _description: string,
  ) {}

  static create(title: string, description: string): BugReport {
    if (!title.trim()) throw new Error("BugReport title cannot be empty");
    if (!description.trim()) throw new Error("BugReport description cannot be empty");
    return new BugReport(title, description);
  }

  title(): string {
    return this._title;
  }
  description(): string {
    return this._description;
  }
}
```

## 5. MagicNumber / Status design

```typescript
const LINEAR_AGENT_LABEL = "agent"; // must match existing label in Linear workspace
```

## 6. Action List

- [x] Create `src/domain/bug-report/bug-report.ts` domain (as shown above)
- [x] Create `src/slack-bug-intake/command/create-linear-issue.command.ts`
  - Call `generateObject` with `thread.messages` to produce `{ title, description }`
  - Construct `BugReport` domain from result
  - Call `LinearTransfer.createIssue({ title, description, labelNames: [LINEAR_AGENT_LABEL] })`
  - Call `thread.post(issueUrl)` to confirm in Slack
  - Unsubscribe the thread after issue is created
- [x] Wire `CreateLinearIssueCommand` into `SlackBotService` — called when `isComplete === true` (Story 2 flow)
- [x] Add unit test for `CreateLinearIssueCommand`:
  - Given a complete conversation → creates issue with correct title and description
  - `LinearTransfer.createIssue` is called with `"agent"` label
- [x] Verify `LinearTransfer.createIssue` supports `labelNames` parameter; extend if needed

## 7. AC (Acceptance Criteria)

- [x] When bug report is complete, bot creates a Linear issue with label `agent` and state `Todo`
- [x] Linear issue description is formatted in markdown with all 5 required sections
- [x] Bot posts the Linear issue URL in the Slack thread after creation
- [x] Bot stops replying in the thread after issue is created (unsubscribed)
- [x] Unit tests pass for `CreateLinearIssueCommand`
- [x] `npm run lint` passes with 0 errors
