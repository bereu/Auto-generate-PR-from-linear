# Agent Execution Plan: Refactor Util Functions to Singleton Classes

## 1. Plan Overview

Convert the standalone function-based utilities in `src/util/` to singleton classes, consistent with the pattern already established by `Langsmith` and `TimeManagement`. The targets are `logger.ts`, `webhook-adapter.ts`, and `prompt-loader.ts`.

> `github.ts` is handled separately in `refactor-github-to-transfer.md`.

## 2. Why It Is Needed

`INDEX.md` documents that `src/utils` is singleton. `langsmith.ts` and `timemanagement.ts` already follow the pattern. The remaining three files (`logger`, `webhook-adapter`, `prompt-loader`) export plain functions or a plain `const`, violating the architectural contract and making mocking / dependency injection inconsistent.

## 3. Current State vs Target

| File                          | Current                                   | Target                                                        |
| ----------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `src/util/logger.ts`          | Exports `export const logger = pino(...)` | `Logger` singleton class with `info/warn/error/debug` methods |
| `src/util/webhook-adapter.ts` | Exports `dispatchWebhook()` function      | `WebhookAdapter` singleton class with `dispatch()` method     |
| `src/util/prompt-loader.ts`   | Exports `loadPrompt()` function           | `PromptLoader` singleton class with `load()` method           |

Each class must follow the pattern:

```typescript
export class Foo {
  private static instance: Foo;
  private constructor() { ... }
  static getInstance(): Foo { ... }
  // methods
}
export const foo = Foo.getInstance();
```

## 4. Action List

- [x] Refactor `src/util/logger.ts` to `Logger` singleton class; export `logger = Logger.getInstance()` for backwards compatibility
- [x] Refactor `src/util/webhook-adapter.ts` to `WebhookAdapter` singleton class with `dispatch()` method
- [x] Refactor `src/util/prompt-loader.ts` to `PromptLoader` singleton class with `load()` method
- [x] Update all callers of `dispatchWebhook` to use `webhookAdapter.dispatch()`
- [x] Update all callers of `loadPrompt` to use `promptLoader.load()`
- [x] Verify all existing tests still pass (`npm run test`)
- [x] Run lint (`npm run lint`)

## 5. AC (Acceptance Criteria)

- [ ] All three files export a singleton instance via `getInstance()` pattern
- [ ] No plain exported functions remain in `src/util/` (except those pending move to transfer)
- [ ] All callers updated — no broken imports
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
