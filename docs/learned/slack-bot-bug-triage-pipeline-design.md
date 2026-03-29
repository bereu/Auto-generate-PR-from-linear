# What I Learned: Slack Bot → Linear Bug Triage Pipeline Design

**Date:** 2026-03-28

## What I Learned This Session

### The `agent` label is the trigger between the two pipelines

When the bot creates a Linear issue from a Slack bug report, it **must** include `labelNames: ["agent"]`. Without this label, the issue is created but the downstream code-generation pipeline (Linear webhook → Claude implements → PR) never fires.

```typescript
await linearTransfer.createIssue({
  title: object.title,
  description: object.description,
  labelNames: ["agent"], // ← REQUIRED to trigger agent pipeline
});
```

This label name must match the existing label in the Linear workspace. If the label is renamed or missing, the pipeline silently breaks — no error is thrown by the Linear SDK.

### Thread lifecycle has a mandatory unsubscribe step

After the bot creates the Linear issue, it must call `thread.unsubscribe()` (or equivalent). If you don't, the bot keeps listening to follow-up messages in that thread and will try to evaluate a report that's already been filed.

Correct lifecycle:

1. `onNewMention` → `thread.subscribe()` → evaluate
2. Loop: evaluate → post clarifying question → receive answer → re-evaluate
3. Complete → create issue → `thread.post(url)` → **unsubscribe**
4. OR: max rounds exceeded → `thread.post(FALLBACK_MESSAGE)` → **unsubscribe**

### `generateObject` is used twice for different purposes in the same pipeline

The same Vercel AI SDK `generateObject` call pattern is used for two distinct tasks:

| Step     | What `generateObject` does            | Zod schema                                                    |
| -------- | ------------------------------------- | ------------------------------------------------------------- |
| Evaluate | Checks if report is complete          | `{ isComplete: boolean, clarifyingQuestion: string \| null }` |
| Format   | Converts conversation to Linear issue | `{ title: string, description: string }`                      |

You do NOT need `generateText` or `streamText` in this pipeline — both steps produce structured objects, not free-form text.

### `thread.messages` eliminates the need for any manual conversation state

Chat SDK's `thread.messages` already contains the full conversation history in a format the AI SDK accepts directly. Pass it as `messages:` to `generateObject` — no custom state store or message accumulation needed:

```typescript
await generateObject({
  model: anthropic("claude-haiku-4-5-20251001"),
  messages: thread.messages, // ← Chat SDK owns the history
  schema: z.object({ isComplete: z.boolean(), clarifyingQuestion: z.string().nullable() }),
});
```

### `MAX_CLARIFICATION_ROUNDS` is a hard requirement, not optional polish

Without a round limit the bot can loop forever if the LLM keeps asking questions (e.g., the user's replies are confusing or ambiguous). The value `5` was chosen as a reasonable ceiling. The fallback path (ask user to file manually) must be tested explicitly — it's easy to only test the happy path.

## What a New Team Member Should Know

- The Slack → Linear bot is a **new intake path** into the existing agent pipeline. The pipeline is: Slack mention → clarify → create Linear issue with `agent` label → existing webhook → Claude implements → PR.
- The `agent` label is the only bridge between the two halves. If it's missing, nothing downstream fails noisily — the issue just sits in Linear with no agent picking it up.
- The domain object `BugReport` has no setters — use `BugReport.create(title, description)` static factory. The constructor is private. This follows the existing domain convention in this codebase.
- `thread.unsubscribe()` must be called in both terminal states: issue created AND max rounds exceeded.

## Docs & Info That Would Speed Things Up Next Time

- `docs/learned/vercel-chat-sdk-vs-ai-sdk.md` — Chat SDK setup, `thread.subscribe()` requirement
- `src/transfer/linear.transfer.ts` — check whether `createIssue` already accepts `labelNames`; may need to extend
- Existing domain pattern examples: `src/domain/` — all use `static create()` factory with private constructor and getter methods, no setters
