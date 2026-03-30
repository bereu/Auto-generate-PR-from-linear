# Agent Execution Plan: refactor-chat-sdk-to-transfer

## 1. Plan Overview

`SlackBotCoordinator` directly instantiates `createSlackAdapter`, `Chat`, and `createMemoryState` (all external SDK calls). BE-001 mandates that external service connections belong in the Transfer layer. This refactor extracts the Slack connection into a new `SlackTransfer` class.

## 2. Why It Is Needed

Violates BE-001: external SDKs must live in the Transfer layer, not in Coordinators. Moving SDK initialization to `SlackTransfer` makes the coordinator testable in isolation and aligns the codebase with the established `LinearTransfer` pattern.

## 3. MagicNumber / Status design

No new constants needed.

## 4. Action List

- [ ] Create `src/transfer/slack.transfer.ts` — `@Injectable() SlackTransfer` with:
  - `onModuleInit()`: initialize `Chat` with `createSlackAdapter` + `createMemoryState`
  - `onNewMention(handler)`: delegate to `this.chat.onNewMention(handler)`
  - `onSubscribedMessage(handler)`: delegate to `this.chat.onSubscribedMessage(handler)`
  - `handleWebhook(req, res)`: move exact logic from `SlackBotCoordinator.handleWebhook()`
- [ ] Update `src/slack-bug-intake/coordinator/slack-bot.coordinator.ts`:
  - Inject `@Inject(SlackTransfer) private readonly slackTransfer: SlackTransfer`
  - Remove direct SDK imports (`Chat`, `createSlackAdapter`, `createMemoryState`)
  - Replace `onModuleInit()` body with delegation to `slackTransfer.onNewMention/onSubscribedMessage`
  - Replace `handleWebhook()` body with `return this.slackTransfer.handleWebhook(req, res)`
- [ ] Add `SlackTransfer` to providers in `src/slack-bug-intake/slack-bug-intake.module.ts`

## 5. AC (Acceptance Criteria)

- [ ] `SlackBotCoordinator` has no direct imports of `chat`, `@chat-adapter/slack`, or `@chat-adapter/state-memory`
- [ ] Slack webhook still receives and processes events correctly
- [ ] `npm run test` passes
- [ ] `npm run lint` passes (BE-001 archgate check)
