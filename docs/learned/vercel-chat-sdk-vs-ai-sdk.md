# What I Learned: Vercel Chat SDK (`chat`) vs AI SDK (`ai`)

**Date:** 2026-03-28

## What I Learned This Session

### Two separate packages, not one

When the user said "use chat.sdk of Vercel," I initially confused this with the well-known Vercel AI SDK (`ai` package). They are **two different packages** that work together:

| Package  | npm name | Role                                                               |
| -------- | -------- | ------------------------------------------------------------------ |
| Chat SDK | `chat`   | Abstracts bot plumbing (Slack, Teams, Discord, Linear…)            |
| AI SDK   | `ai`     | Handles LLM calls (`streamText`, `generateText`, `generateObject`) |

Install:

```bash
npm i chat @chat-adapter/slack @chat-adapter/state-postgres
npm i ai @ai-sdk/anthropic
```

### Chat SDK removes the need for manual Slack webhook code

When building a Slack bot manually (NestJS controller), you must implement:

- `X-Slack-Signature` HMAC-SHA256 verification with `crypto.timingSafeEqual`
- Rejecting requests older than 5 minutes
- Handling the URL verification challenge (`{ challenge }` response)
- Responding within 3 seconds (fire-and-forget async handling)

**Chat SDK abstracts all of that.** You only write event handlers:

```typescript
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-postgres";

const bot = new Chat({
  userName: "mybot",
  adapters: { slack: createSlackAdapter() },
  state: createPostgresState(),
});

bot.onNewMention(async (thread) => {
  await thread.subscribe(); // ← REQUIRED to receive follow-up messages
  await thread.post("Got it!");
});

bot.onSubscribedMessage(async (thread, message) => {
  await thread.post(`You said: ${message.text}`);
});
```

### `thread.subscribe()` is required — not optional

If you forget `thread.subscribe()` in `onNewMention`, the bot will **never fire `onSubscribedMessage`** for follow-up messages in that thread. This is not obvious from the naming.

### AI SDK streaming integrates directly via `thread.post()`

```typescript
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

bot.onNewMention(async (thread) => {
  await thread.subscribe();
  const result = await streamText({
    model: anthropic("claude-haiku-4-5-20251001"),
    prompt: thread.messages, // full conversation history
  });
  await thread.post(result.textStream); // streams tokens into Slack thread
});
```

`thread.post()` accepts `result.textStream` directly — Chat SDK handles live rendering per platform.

### Supported platforms (single codebase)

Slack, Microsoft Teams, Google Chat, Discord, GitHub, Linear, WhatsApp — swap adapters without changing bot logic.

## What a New Team Member Should Know

- The `chat` package name is literally `chat` — not `@vercel/chat` or `@chat-sdk/core`. Search npm for `chat` by Vercel.
- You **do not** need to implement a NestJS webhook controller for Slack events when using Chat SDK. The adapter handles the HTTP endpoint.
- Always call `thread.subscribe()` inside `onNewMention` when you need multi-turn conversation in a thread.
- State adapters (`@chat-adapter/state-postgres`, `@chat-adapter/state-redis`) store thread subscriptions between restarts.
- The `thread.messages` property gives you the full conversation history to pass to the LLM.

## Docs & Info That Would Speed Things Up Next Time

- Vercel Chat SDK launch article with all code examples: https://vercel.com/blog/chat-sdk-brings-agents-to-your-users
- Vercel changelog entry: https://vercel.com/changelog/chat-sdk
- Reference template repo: `vercel-labs/ai-sdk-slackbot` on GitHub
