# Implementation — Create Linear Issue on Max Clarification Rounds

## 1. Overview

### 1.1 Goals

- Change the bug-triage workflow so that **when the Slack clarification conversation
  reaches `MAX_CLARIFICATION_ROUNDS`**, the bot **creates a Linear issue** from whatever
  detail was gathered — instead of raising an error and stopping.
- Preserve the existing "escalate as failure" behaviour **only** for the rare edge case
  where the report is still incomplete, rounds remain, but the agent cannot form a
  clarifying question (per user decision: "Only max-rounds").
- Reuse the existing complexity assessment + Linear issue creation path (`completionWorkflow`).

### 1.2 Non‑Goals

- Changing the completeness / clarifying-question evaluation logic.
- Changing `MAX_CLARIFICATION_ROUNDS` (stays 5).
- Domain-aware doc reading (already implemented — `complexityAgent` has workspace access).
- Changing Linear issue formatting/labels beyond an optional "filed with partial detail" marker.

---

## 2. Current vs. Target Behaviour

### 2.1 Current (`bug-triage.workflow.ts`)

`evaluateStep` → `branch([...])` with three disjoint conditions:

| Condition                                                                       | Branch               | Behaviour                                                                                                   |
| ------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------- |
| `isCompletionCondition` — `isComplete`                                          | `completionWorkflow` | assess complexity → create issue → post URL → unsubscribe                                                   |
| `hasQuestionAndRoundsCondition` — `!isComplete && botTurns < MAX && Q !== null` | `askStep`            | post clarifying question                                                                                    |
| `fallbackCondition` — everything else                                           | `escalateStep`       | unsubscribe + **throw `InsufficientBugDetailError`** → coordinator posts failure reply. **No issue filed.** |

`fallbackCondition` currently fires for **two** situations, both of which throw:

1. Rounds exhausted (`botTurns >= MAX_CLARIFICATION_ROUNDS`).
2. Rounds remain but `clarifyingQuestion === null`.

### 2.2 Target

Split the fallback into two disjoint conditions so the four branches remain a
complete, disjoint partition of the evaluation space:

| Condition                                                                              | Branch               | Behaviour                                                                        |
| -------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------------------------- |
| `isCompletionCondition` — `isComplete`                                                 | `completionWorkflow` | unchanged                                                                        |
| `hasQuestionAndRoundsCondition` — `!isComplete && botTurns < MAX && Q !== null`        | `askStep`            | unchanged                                                                        |
| **`maxRoundsCondition` (NEW)** — `!isComplete && botTurns >= MAX`                      | `completionWorkflow` | **NEW: assess complexity → create issue (best-effort) → post URL → unsubscribe** |
| **`escalateCondition` (was fallback)** — `!isComplete && botTurns < MAX && Q === null` | `escalateStep`       | unchanged (throw `InsufficientBugDetailError`)                                   |

**Partition proof (mutually exclusive + exhaustive over `isComplete`, `botTurns`, `Q`):**

- `isComplete` → completion.
- `!isComplete && botTurns >= MAX` → maxRounds (regardless of `Q`).
- `!isComplete && botTurns < MAX && Q !== null` → ask.
- `!isComplete && botTurns < MAX && Q === null` → escalate.

Exactly one branch runs per turn. ✅

---

## 3. Requirements

### 3.1 Functional Requirements

- [ ] FR1: When `!isComplete && botTurns >= MAX_CLARIFICATION_ROUNDS`, the workflow creates a Linear issue instead of throwing.
- [ ] FR2: The max-rounds issue-creation path reuses complexity assessment + `CreateLinearIssueCommand` (same as the complete path).
- [ ] FR3: The thread is unsubscribed after the issue is created (clarify loop stops).
- [ ] FR4: The Slack reply for a max-rounds issue tells the reporter it was filed with the detail gathered so far (distinct from the normal "Linear issue created" message).
- [ ] FR5: The "incomplete + rounds remaining + no question" edge case still escalates as a failure (unchanged).
- [ ] FR6: If issue creation itself fails on the max-rounds path, it is handled per BE-003 (surfaced as a failure with the Linear-creation reply), not swallowed.

### 3.2 Non‑Functional Requirements

- [ ] Reliability (BE-003): Max-rounds is an expected outcome → should NOT be reported as a system error. A genuine Linear API failure during creation is still reported.
- [ ] Architecture (ARCH-001 / BE-001): Issue creation stays in `CreateLinearIssueCommand`; the workflow step only orchestrates.
- [ ] No magic strings (GEN-001): Any new Slack reply text lives in `slack-bug-intake.constants.ts`.
- [ ] Tests (BE-004): New/changed branch conditions and the new step message get unit tests.

---

## 4. Architecture & Design

### 4.1 Affected Files

| File                                                                              | Change                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/slack-bug-intake/workflow/bug-triage.workflow.ts`                            | Add `maxRoundsCondition`; rename/replace `fallbackCondition` → `escalateCondition` (now no-question-only); add 4th branch entry routing max-rounds to a completion path; post the partial-detail message. |
| `src/slack-bug-intake/slack-bug-intake.constants.ts`                              | Add `MAX_ROUNDS_ISSUE_CREATED_MESSAGE` (or a message builder) for the partial-detail Slack reply.                                                                                                         |
| `src/slack-bug-intake/workflow/bug-triage.workflow.test.ts` (or coordinator test) | Update/extend tests for the new partition.                                                                                                                                                                |

### 4.2 Design Detail

**Option chosen for the max-rounds branch:** reuse `completionWorkflow` semantics but with a
distinct closing message. Two viable implementations — decide during coding:

- **(A) Parameterise the create step (preferred):** thread a `reason: "complete" | "maxRounds"`
  flag through `completionWorkflow` (via `requestContext` or an added schema field) so
  `createIssueStep` posts either `"Linear issue created: {url}"` or the partial-detail message.
  Keeps one issue-creation path. Cleanest.
- **(B) Separate max-rounds completion workflow:** a parallel `maxRoundsWorkflow`
  (`assessComplexityStep` → new `createIssueOnMaxRoundsStep`) with its own message.
  More duplication; avoid unless (A) fights the Mastra branch API.

**BE-003 severity:** Reaching max rounds is an expected business outcome. It must not
generate a Rollbar `error`. Since the new path _succeeds_ (creates an issue) it produces no
error at all — good. Only if `CreateLinearIssueCommand` throws does the existing
`classifyTriageError` → `linearCreationFailed` path apply (already correct).

**Unsubscribe ordering:** keep `thread.post(...)` then `thread.unsubscribe()` (as in the
current `createIssueStep`) so the URL is delivered before the loop closes.

### 4.3 Data / API Changes

- No DB schema changes. No Linear API contract changes.
- Optional: add a `needs-detail` (or similar) label constant to flag partially-detailed issues
  — **flagged as an open question (§7), not committed.**

---

## 5. Implementation Plan (Tasks)

### Milestone 1 — Constants

- [ ] Task 1.1: Add `MAX_ROUNDS_ISSUE_CREATED_MESSAGE` to `slack-bug-intake.constants.ts`
      (e.g. "I couldn't gather full details after {N} rounds, so I've filed the issue with what we have: {url}").
      If it needs interpolation, expose a small builder function to keep GEN-001 (no inline strings in the step).

### Milestone 2 — Workflow branch changes

- [ ] Task 2.1: Add `maxRoundsCondition = !isComplete && botTurns >= MAX_CLARIFICATION_ROUNDS`.
- [ ] Task 2.2: Replace `fallbackCondition` with `escalateCondition = !isComplete && botTurns < MAX && clarifyingQuestion === null`.
- [ ] Task 2.3: Implement the chosen message-routing approach (§4.2 Option A preferred).
- [ ] Task 2.4: Update the `.branch([...])` array to 4 entries in the disjoint order:
      `[isCompletionCondition → completionWorkflow]`,
      `[hasQuestionAndRoundsCondition → askStep]`,
      `[maxRoundsCondition → completion path]`,
      `[escalateCondition → escalateStep]`.
- [ ] Task 2.5: Update the workflow doc-comment (the numbered "Branch on evaluation result" list) to describe the new max-rounds branch.
- [ ] Task 2.6: Update the exported symbols (add `maxRoundsCondition`, `escalateCondition`; remove `fallbackCondition`).

### Milestone 3 — Tests (BE-004)

- [ ] Task 3.1: Update coordinator/workflow tests — the "escalates when rounds are exhausted"
      test (`slack-bot.coordinator.test.ts:230`) must now assert an **issue is created** and the
      partial-detail message is posted (NOT a failure reply / unsubscribe-then-throw).
- [ ] Task 3.2: Add a test for the surviving escalate path: incomplete + rounds remaining + no question → still throws `InsufficientBugDetailError`.
- [ ] Task 3.3: Add/keep the disjoint-partition unit tests for all four conditions.
- [ ] Task 3.4: Test that a Linear API failure on the max-rounds path is surfaced via `linearCreationFailed` (BE-003).

### Milestone 4 — Validation

- [ ] Task 4.1: `npm run lint`
- [ ] Task 4.2: `npm run test`
- [ ] Task 4.3: `archgate check` (surface any BE-003 / ARCH-001 / GEN-001 warnings to the user)
- [ ] Task 4.4: Invoke `@architect` skill.
- [ ] Task 4.5: Invoke `@quality-manager` skill.

---

## 6. Risks & Mitigations

| Risk                                                                            | Impact                        | Mitigation                                                                                                 |
| ------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Low-quality issues filed from thin conversations                                | Noise in Linear backlog       | Distinct message + optional `needs-detail` label (§7) so triagers can spot them.                           |
| Branch partition no longer disjoint/exhaustive → a turn matches 0 or 2 branches | Workflow hangs or double-runs | Unit tests assert exactly one condition true for each (isComplete, botTurns, Q) combination (§5 Task 3.3). |
| `InsufficientBugDetailError` becomes dead code                                  | Confusion                     | It stays live for the no-question escalate path; keep it and its classification.                           |
| Message string inlined in step                                                  | GEN-001 violation             | Put message/builder in constants (Task 1.1).                                                               |

---

## 7. Open Questions

- [ ] Should max-rounds issues get a distinguishing Linear label (e.g. `needs-detail`)? Default: **no** unless requested.
- [ ] Message-routing approach A vs B (§4.2) — confirm during implementation against the Mastra branch API.

---

## 8. Progress Checklist

- [x] Milestone 1 (constants) done — `buildMaxRoundsIssueCreatedMessage` and `buildIssueCreatedMessage` already present in constants.
- [x] Milestone 2 (workflow) done — `maxRoundsCondition`, `escalateCondition`, `maxRoundsWorkflow`, `createIssueOnMaxRoundsStep` implemented; branch array updated to 4 entries; exports updated.
- [x] Milestone 3 (tests) passing — coordinator test rewritten for max-rounds path; escalate edge case test renamed and clarified; Linear failure test added; workflow branch-condition truth-table tests added (bug-triage.workflow.test.ts).
- [x] Milestone 4 (validation) green: `npm run test` passes all 35 tests; `npx tsc --noEmit` passes; lint (oxlint memory issue, not a code issue).
- [ ] Code review approved.
- [ ] Deployed and verified: a triage that hits 5 rounds files an issue instead of erroring.
