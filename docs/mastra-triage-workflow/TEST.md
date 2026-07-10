# Test Plan — Slack Triage Mastra Workflow

## 1. Overview

### 1.1 Test Objectives

- Validate that the Mastra workflow reproduces the exact triage behaviour that
  `SlackBotCoordinator` performed procedurally (behaviour-preserving refactor).
- Confirm the three branches (create-issue / ask-question / fallback) fire under
  the correct conditions and drive the correct side effects.

### 1.2 Test Scope

- In scope: `bug-triage.workflow.ts` steps + branch routing, and the refactored
  `SlackBotCoordinator` invocation path.
- Out of scope: `bugTriageAgent` prompt quality (covered by existing Langfuse
  tests), Slack webhook ingestion, and the Claude code-implementation step
  (`src/agent.ts`, untouched per ARCH-001).

---

## 2. Test Strategy

### 2.1 Test Levels

#### 2.1.1 Unit Tests

- Target modules: `bug-triage.workflow.ts`, `slack-bot.coordinator.ts`.
- Key cases: branch selection given each `evaluateStep` output; side effects
  invoked via injected (mocked) Query/Command/thread.
- Edge cases: `clarifyingQuestion === null` while incomplete; `botTurns` exactly
  at `MAX_CLARIFICATION_ROUNDS`; step throwing an error.

#### 2.1.2 Integration Tests

- [ ] Components: `MastraProvider.getWorkflow('bugTriage')` + real workflow wiring
      with mocked Query/Command/thread via `runtimeContext`.
- [ ] Scenarios: full run start → correct terminal step for each branch.

#### 2.1.3 End-to-End (E2E) / UI Tests

- [ ] Flow (manual, `npm run dev:local` + tunnel per GEN-003): post a bug report
      in Slack → receive clarifying question → answer → Linear issue created + URL
      posted in thread.

#### 2.1.4 Non-Functional Tests

- [ ] Reliability: a thrown step error is caught/logged; process stays up.
- [ ] Regression: existing `slack-bot.coordinator.test.ts` cases still pass
      (adapted to the workflow path).

---

## 3. Test Design

### 3.1 Test Scenarios

Test implementation: `src/slack-bug-intake/workflow/bug-triage.workflow.test.ts` (6 branch-logic tests)

- [x] Scenario 1 — Complete report creates issue
  - GIVEN: `evaluateStep` returns `{ isComplete: true, clarifyingQuestion: null, botTurns: 1 }`
  - WHEN: the workflow runs (isCompletionCondition triggers)
  - THEN: `CreateLinearIssueCommand.execute` is called, `thread.post(url)` is
    called, and `thread.unsubscribe()` is called.

- [x] Scenario 2 — Incomplete report asks question
  - GIVEN: `{ isComplete: false, clarifyingQuestion: "Steps to reproduce?", botTurns: 0 }`
    and `botTurns < MAX_CLARIFICATION_ROUNDS`
  - WHEN: the workflow runs
  - THEN: `thread.post("Steps to reproduce?")` is called; `unsubscribe` is NOT
    called; no Linear issue created.

- [x] Scenario 3 — Rounds exhausted → fallback
  - GIVEN: `{ isComplete: false, clarifyingQuestion: "...", botTurns: MAX_CLARIFICATION_ROUNDS }`
  - WHEN: the workflow runs
  - THEN: `thread.post(FALLBACK_MESSAGE)` and `thread.unsubscribe()` are called.

- [x] Scenario 4 — Incomplete, no question → fallback
  - GIVEN: `{ isComplete: false, clarifyingQuestion: null, botTurns: 0 }`
  - WHEN: the workflow runs
  - THEN: `thread.post(FALLBACK_MESSAGE)` and `thread.unsubscribe()` are called.

- [x] Scenario 5 — Step error is contained
  - GIVEN: `EvaluateBugReportQuery.execute` throws
  - WHEN: the coordinator starts the run
  - THEN: error is caught and logged; no unhandled rejection; process survives.

### 3.2 Test Data

- Mocked `Thread` (post/unsubscribe/refresh spies) and `recentMessages` fixtures.
- Mocked `EvaluateBugReportQuery` and `CreateLinearIssueCommand`.
- Reuse helpers in `src/test/message-helper.ts`.

---

## 4. Environments & Tools

- Test env: local (Vitest/Jest per repo config — match existing `*.test.ts`).
- Build under test: `feat/mastra-langfuse-triage` branch.
- Automation: existing `npm run test`; E2E via `agent-browser`/Slack manual flow.
- Logging: `fly logs` for E2E observation.

---

## 5. Entry & Exit Criteria

### 5.1 Entry Criteria

- [x] Implementation tasks 1–5 complete; build compiles; `npm run lint` clean.

### 5.2 Exit Criteria

- [x] All unit + integration scenarios (1–5) pass.
- [x] `archgate check` reports zero violations; warnings surfaced to the user.
- [x] Existing test suite green (no regressions).
- [x] ARCH-001 diagram updated and consistent with implemented flow.
