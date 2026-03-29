# Agent Execution Plan: fix-magic-strings-in-tests

## 1. Plan Overview

Replace raw magic strings in `webhook.service.test.ts` with the constants already defined in `repos.config.ts` and `webhook.service.ts`. This applies GEN-001 (Magic Number and Status Management) to the test layer.

## 2. Why It Is Needed

ADR GEN-001 prohibits raw string literals for statuses or configuration values. Currently `webhook.service.test.ts` uses `"Todo"`, `"In Progress"`, `"agent"`, `"Issue"`, `"Comment"` directly. If a constant is renamed, the test silently diverges from the real system, breaking the safety net.

## 3. MagicNumber / Status design

All values already exist as constants — no new design needed. The issue is that tests bypass them.

Rename technical constant names to business-meaningful names when exporting from `webhook.service.ts`:

```typescript
// repos.config.ts (already defined — no change)
export const LINEAR_LABEL = "agent";
export const LINEAR_STATES = {
  todo: "Todo",
  inProgress: "In Progress",
  ...
} as const;

// webhook.service.ts — rename to reflect business meaning, then export
export const ISSUE_EVENT_TYPE = "Issue";           // was: WEBHOOK_TYPE_ISSUE
export const ISSUE_TRIGGER_ACTIONS = ["create", "update"] as const; // was: WEBHOOK_ACTIONS
```

## 4. Action List

- [x] Rename `WEBHOOK_TYPE_ISSUE` → `ISSUE_EVENT_TYPE` in `src/webhook/webhook.service.ts` and export it
- [x] Rename `WEBHOOK_ACTIONS` → `ISSUE_TRIGGER_ACTIONS` in `src/webhook/webhook.service.ts` and export it
- [x] In `webhook.service.test.ts`, import `LINEAR_STATES`, `LINEAR_LABEL`, `ISSUE_EVENT_TYPE`, `ISSUE_TRIGGER_ACTIONS`
- [x] Replace `state: { name: "Todo" }` with `state: { name: LINEAR_STATES.todo }`
- [x] Replace `state: { name: "In Progress" }` with `state: { name: LINEAR_STATES.inProgress }`
- [x] Replace `labels: [{ name: "agent" }]` with `labels: [{ name: LINEAR_LABEL }]`
- [x] Replace `type: "Issue"` with `type: ISSUE_EVENT_TYPE`
- [x] Replace `action: "update"` in `validPayload` with `ISSUE_TRIGGER_ACTIONS[1]`

## 5. AC (Acceptance Criteria)

- [x] No raw string literals for state names, label names, or event type in `webhook.service.test.ts`
- [x] `ISSUE_EVENT_TYPE` and `ISSUE_TRIGGER_ACTIONS` are exported from `webhook.service.ts`
- [x] `npm run test` passes without modification to test logic
- [x] `npm run lint` passes
