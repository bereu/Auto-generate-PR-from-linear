# Bot Asks Clarifying Questions When Bug Report Is Incomplete

## 1. Plan Overview

After the bot receives a mention or follow-up thread message (Story 1), it uses the **Vercel AI SDK** (`ai`) with `generateObject` to evaluate whether the report contains enough information to file a Linear issue. If incomplete, the bot posts one targeted clarifying question back into the Slack thread via `thread.post()`. This continues until the report is complete or the max round limit is reached.

## 2. Why It Is Needed

Raw bug reports often lack reproduction steps, environment info, or expected vs actual behaviour. Gathering this before creating the Linear issue improves issue quality and reduces engineering triage time.

## 3. Architecture

```
src/
  slack-bug-intake/
    command/
      evaluate-bug-report.command.ts    ← AI evaluation via Vercel AI SDK
```

### AI SDK evaluation

Use `generateObject` to get structured output from the LLM:

```typescript
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const { object } = await generateObject({
  model: anthropic("claude-haiku-4-5-20251001"),
  system: TRIAGE_SYSTEM_PROMPT,
  messages: thread.messages, // Chat SDK provides full conversation history
  schema: z.object({
    isComplete: z.boolean(),
    clarifyingQuestion: z.string().nullable(), // null when isComplete is true
  }),
});
```

`thread.messages` from Chat SDK already contains the full conversation history (user messages + bot replies) — no manual state management needed.

### What counts as "complete"

A bug report is complete when it includes all of:

| Field                  | Example                         |
| ---------------------- | ------------------------------- |
| **Summary**            | One-line description of the bug |
| **Steps to reproduce** | Numbered steps                  |
| **Expected behaviour** | What should happen              |
| **Actual behaviour**   | What actually happens           |
| **Environment**        | OS, browser, app version        |

### System prompt

```typescript
const TRIAGE_SYSTEM_PROMPT = `
You are a bug triage assistant. Evaluate whether the conversation contains:
1. A clear summary of the problem
2. Steps to reproduce
3. Expected behaviour
4. Actual behaviour
5. Environment information (OS, browser, version)

If any are missing: set isComplete to false and provide ONE focused clarifying question.
If all are present: set isComplete to true and clarifyingQuestion to null.
`;
```

### Flow wired into SlackBotService

```typescript
// onNewMention and onSubscribedMessage both call this flow:
const { isComplete, clarifyingQuestion } = await evaluateBugReport.execute(thread);

if (!isComplete && thread.roundCount < MAX_CLARIFICATION_ROUNDS) {
  await thread.post(clarifyingQuestion);
} else if (!isComplete) {
  await thread.post(FALLBACK_MESSAGE); // ask user to file manually
} else {
  // delegate to CreateLinearIssueCommand (Story 3)
}
```

## 4. MagicNumber / Status design

```typescript
const MAX_CLARIFICATION_ROUNDS = 5; // prevent infinite loops

const FALLBACK_MESSAGE =
  "I wasn't able to gather all the details I need. " +
  "Please file the issue directly in Linear with as much detail as possible.";
```

## 5. Action List

- [x] Install AI SDK dependencies (if not already present)
  ```
  pnpm add ai @ai-sdk/anthropic
  ```
- [x] Create `src/slack-bug-intake/command/evaluate-bug-report.command.ts`
  - Accept `thread` (Chat SDK thread object) as input
  - Call `generateObject` with `thread.messages` as conversation history
  - Return `{ isComplete: boolean, clarifyingQuestion: string | null }`
- [x] Wire evaluation result into `SlackBotService` (Story 1):
  - `isComplete === false` and rounds < `MAX_CLARIFICATION_ROUNDS` → `thread.post(clarifyingQuestion)`
  - `isComplete === false` and rounds >= limit → `thread.post(FALLBACK_MESSAGE)`, unsubscribe thread
  - `isComplete === true` → delegate to `CreateLinearIssueCommand` (Story 3)
- [x] Verify `ANTHROPIC_API_KEY` is present in env validation in `src/main.ts`
- [x] Add unit tests for `EvaluateBugReportCommand`:
  - Complete report → `isComplete: true`, `clarifyingQuestion: null`
  - Missing steps to reproduce → `isComplete: false`, question asks for steps
  - Missing environment → `isComplete: false`, question asks for environment

## 6. AC (Acceptance Criteria)

- [x] Bot replies with ONE clarifying question when the report is incomplete
- [x] Bot does NOT ask more questions once all fields are present
- [x] Follow-up user answers are included in the evaluation (via `thread.messages`)
- [x] After `MAX_CLARIFICATION_ROUNDS` incomplete rounds, bot posts fallback message and stops
- [x] Unit tests pass for the three scenarios above
- [x] `npm run lint` passes with 0 errors
