# User Can Mention Slack Bot to Report a Bug

## 1. Plan Overview

Set up the **Vercel Chat SDK** (`chat`) with a Slack adapter so the NestJS app can receive `app_mention` events. When a user @-mentions the bot, the bot subscribes to the thread and acknowledges the report. This is the entry point for the Slack → Linear bug triage pipeline described in ARCH-001.

Chat SDK handles all Slack plumbing (signature verification, URL verification challenge, adapter routing) so no manual webhook parsing is needed.

## 2. Why It Is Needed

The system currently only receives Linear webhook events. The Slack intake step — receiving a human bug report — is missing. Chat SDK abstracts the Slack Events API into simple event handlers (`onNewMention`, `onSubscribedMessage`), letting us focus on bot logic rather than Slack API details.

## 3. Architecture

```
src/
  slack-bug-intake/
    slack-bot.service.ts       ← Chat SDK bot initialization (NestJS service)
    slack-bug-intake.module.ts
```

Chat SDK is initialized as a NestJS service and mounted alongside the existing NestJS HTTP server.

### Chat SDK setup

```typescript
import { Chat } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createPostgresState } from "@chat-adapter/state-postgres"; // or state-redis

const bot = new Chat({
  userName: "bug-triage-bot",
  adapters: { slack: createSlackAdapter() },
  state: createPostgresState(), // persists thread subscriptions across restarts
});

// Fires when user first @mentions the bot
bot.onNewMention(async (thread) => {
  await thread.subscribe(); // keep listening to follow-up messages
  await thread.post("Thanks for the report! Let me check if I need more information...");
  // delegate to bug evaluation (Story 2)
});

// Fires on every follow-up user message in a subscribed thread
bot.onSubscribedMessage(async (thread, message) => {
  // delegate to bug evaluation (Story 2)
});
```

### Required env vars

| Var                    | Purpose                                           |
| ---------------------- | ------------------------------------------------- |
| `SLACK_BOT_TOKEN`      | Bearer token for Slack Web API                    |
| `SLACK_SIGNING_SECRET` | HMAC secret — used internally by Chat SDK adapter |

Chat SDK adapter auto-detects these from env vars; no manual wiring needed.

## 4. MagicNumber / Status design

```typescript
// src/slack-bug-intake/slack-bug-intake.constants.ts
const SLACK_BOT_USERNAME = "bug-triage-bot";
```

## 5. Action List

- [x] Install dependencies
  ```
  pnpm add chat @chat-adapter/slack @chat-adapter/state-postgres
  ```
- [x] Create `src/slack-bug-intake/slack-bot.service.ts` (NestJS `@Injectable`)
  - Initialize `new Chat({ ... })` in the constructor
  - Register `onNewMention` handler: call `thread.subscribe()`, post acknowledgment, then delegate to `EvaluateBugReportCommand` (Story 2)
  - Register `onSubscribedMessage` handler: delegate to `EvaluateBugReportCommand` (Story 2)
  - Expose `bot` instance for Chat SDK to handle its own HTTP routing
- [x] Create `src/slack-bug-intake/slack-bug-intake.module.ts`
- [x] Register `SlackBugIntakeModule` in `src/app.module.ts`
- [x] Initialize Chat SDK bot in `src/main.ts` after NestJS bootstrap
- [x] Add `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` to env validation in `src/main.ts`

## 6. AC (Acceptance Criteria)

- [x] @mentioning the bot in Slack triggers `onNewMention` — bot replies in thread within 3 seconds
- [x] Follow-up messages in the same thread trigger `onSubscribedMessage`
- [x] Bot does NOT respond to messages in threads it has not subscribed to
- [x] Missing `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` at startup → `process.exit(1)`
- [x] `npm run lint` passes with 0 errors
