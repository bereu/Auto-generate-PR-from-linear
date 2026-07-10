# Test Plan — Intent-aware Triage Router

## 1. Overview

### 1.1 Test Objectives

- Verify incoming messages are correctly routed to the question / bug / feature-request path.
- Verify the question path answers and **stays subscribed**; the bug/feature paths clarify and
  create the correct Linear issue with the correct labels.
- Verify graceful degradation on every new failure mode (BE-003).

### 1.2 Test Scope

- In scope: classification query, answer query, feature-evaluate query, extended issue command,
  workflow branching, coordinator wiring.
- Out of scope (and why): actual Slack/Linear/Anthropic/Langfuse network calls (mocked); the
  downstream Linear-webhook → coding-agent pipeline (unchanged); domain-doc generation.

---

## 2. Test Strategy

### 2.1 Test Levels

#### 2.1.1 Unit Tests

- Target modules:
  - `query/classify-message.query.ts`
  - `query/answer-question.query.ts`
  - `query/evaluate-feature-request.query.ts`
  - `command/create-linear-issue.command.ts` (feature `kind`)
  - `workflow/bug-triage.workflow.ts` (classify + branch conditions, answer step)
- Key cases:
  - Classifier returns each of `question | bug | feature_request` → mapped through.
  - Answer query returns `{ answer }` from mocked agent.
  - Feature evaluate returns `{ isComplete, clarifyingQuestion }`.
  - Command with `kind="feature"` adds `agent` + `feature` labels and uses the feature format prompt.
  - Command with default/`kind="bug"` unchanged (regression).
- Edge cases:
  - Classifier throws → falls back to `bug` (EC1), logs `warn`.
  - Answer agent throws → `answerQuestionStep` posts `buildAnswerFailedMessage()`, no unsubscribe (EC2).
  - Feature max-rounds reached → best-effort issue path (EC3).

#### 2.1.2 Integration Tests

- [ ] Components / APIs involved: workflow run with mocked queries/commands via `RequestContext`.
- [ ] Scenarios:
  - question intent → `answerQuestionStep` runs, `thread.post` called, `thread.unsubscribe` NOT called.
  - bug intent → existing bug chain runs (evaluate → ask/create), issue labels `agent`(+difficulty).
  - feature intent → feature chain runs, issue labels include `feature`.

#### 2.1.3 End-to-End (E2E) / UI Tests

- [ ] User flows (manual, `npm run dev:local` + tunnel per GEN-003):
  - Ask a "how does X work?" question → bot replies with an answer and keeps responding to
    follow-ups in-thread.
  - Report a bug with partial detail → bot asks clarifying questions → files a Linear bug issue.
  - Request "please add feature Y" → bot clarifies → files a Linear issue labelled `feature`.

#### 2.1.4 Non-Functional Tests

- [ ] Performance: confirm only one extra (Haiku) classification call per turn.
- [ ] Security: attempt a doc read outside `docs/domain` via the workspace → rejected.
- [ ] Reliability / Regression: existing bug-triage tests still pass unchanged.

---

## 3. Test Design

### 3.1 Test Scenarios

- [x] Scenario 1 — Question routing & persistence
  - GIVEN a thread whose latest message is a general question
  - WHEN the workflow runs
  - THEN `answerQuestionStep` posts an answer AND the thread remains subscribed (no `unsubscribe`).

- [x] Scenario 2 — Bug routing (regression)
  - GIVEN a thread classified as `bug`
  - WHEN the workflow runs
  - THEN the existing evaluate→clarify/create-issue behaviour is unchanged (labels `agent`+difficulty).

- [x] Scenario 3 — Feature-request routing
  - GIVEN a thread classified as `feature_request` with complete detail
  - WHEN the workflow runs
  - THEN a Linear issue is created with `agent` + `feature` labels and the feature format prompt.

- [x] Scenario 4 — Feature clarification loop
  - GIVEN an incomplete feature request with rounds remaining
  - WHEN the workflow runs
  - THEN a feature-specific clarifying question is posted and the thread stays subscribed.

- [x] Scenario 5 — Classifier failure fallback (EC1)
  - GIVEN the classification agent throws
  - WHEN `classifyStep` runs
  - THEN intent falls back to `bug`, a `warn` is logged, and the bug intake path proceeds.

- [x] Scenario 6 — Answer failure (EC2)
  - GIVEN the answer agent throws
  - WHEN `answerQuestionStep` runs
  - THEN `buildAnswerFailedMessage()` is posted, `warn` is logged, and the thread stays subscribed.

- [x] Scenario 7 — Feature max-rounds (EC3)
  - GIVEN a feature request still incomplete at `MAX_CLARIFICATION_ROUNDS`
  - WHEN the workflow runs
  - THEN a best-effort feature issue is created with the partial-detail message.

### 3.2 Test Data

- Fixtures: message arrays for each intent (question, bug w/ full & partial detail, feature w/
  full & partial detail).
- Mocks: `bugTriageAgent`, `intentClassifierAgent`, `questionAnswerAgent`, `featureIntakeAgent`,
  `complexityAgent` `.generate`; `LinearTransfer.createIssue`; `Thread` (`post`, `subscribe`,
  `unsubscribe`, `refresh`, `recentMessages`).
- No real network; Langfuse falls back to local prompts.

---

## 4. Environments & Tools

- Test environments: local (unit/integration via `npm run test`); dev tunnel for manual E2E.
- Builds / versions under test: current branch build.
- Automation framework / tools: existing test runner (`npm run test`), `npm run lint`,
  `archgate check`.
- Monitoring / logging tools: pino logs (`[slack-triage]`), Langfuse traces, Rollbar (disabled
  locally per BE-003).

---

## 5. Entry & Exit Criteria

### 5.1 Entry Criteria

- IMPLEMENTATION.md tasks 1–8 complete; build compiles; `npm run lint` clean.

### 5.2 Exit Criteria

- All unit + integration scenarios (1–7) pass.
- `archgate check` reports zero ADR violations (warnings surfaced to the user).
- Existing bug-triage tests pass unchanged (regression).
- Manual E2E for the three happy paths verified in-thread.
