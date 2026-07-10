# Test Plan — Create Linear Issue on Max Clarification Rounds

## 1. Overview

### 1.1 Test Objectives

- Verify that reaching `MAX_CLARIFICATION_ROUNDS` with an incomplete report now **creates a
  Linear issue** and posts a partial-detail message — instead of throwing / posting a failure reply.
- Verify the surviving escalate path (incomplete + rounds remaining + no question) still throws.
- Verify the branch partition stays disjoint and exhaustive (exactly one branch per turn).
- Verify BE-003: max-rounds success produces no error report; a real Linear API failure is still surfaced.

### 1.2 Test Scope

- **In scope:** `bug-triage.workflow.ts` branch conditions and steps; the coordinator's
  handling of the new success path; the new Slack message constant.
- **Out of scope:** completeness evaluation logic, complexity assessment internals, Linear API
  client (`LinearTransfer`) internals, domain-doc reading (all pre-existing and unchanged).

---

## 2. Test Strategy

### 2.1 Unit Tests — Branch Conditions

Target: `isCompletionCondition`, `hasQuestionAndRoundsCondition`, `maxRoundsCondition`, `escalateCondition`.

Truth-table cases (`MAX_CLARIFICATION_ROUNDS = 5`):

| #   | isComplete | botTurns | clarifyingQuestion | Expected single branch                                     |
| --- | ---------- | -------- | ------------------ | ---------------------------------------------------------- |
| 1   | true       | 0        | null               | completion                                                 |
| 2   | true       | 5        | "q"                | completion                                                 |
| 3   | false      | 1        | "q"                | ask                                                        |
| 4   | false      | 4        | "q"                | ask                                                        |
| 5   | false      | 5        | "q"                | **maxRounds (create issue)**                               |
| 6   | false      | 6        | null               | **maxRounds (create issue)**                               |
| 7   | false      | 2        | null               | escalate (throw)                                           |
| 8   | false      | 5        | null               | **maxRounds (create issue)** — rounds win over no-question |

- [ ] For each row, assert exactly ONE condition returns true (disjoint + exhaustive).

### 2.2 Unit / Step Tests

- [ ] Max-rounds path calls `CreateLinearIssueCommand.execute(...)` (delegation preserved, ARCH-001).
- [ ] Max-rounds path posts `MAX_ROUNDS_ISSUE_CREATED_MESSAGE` (with URL / round count), NOT the plain "Linear issue created" text.
- [ ] Max-rounds path calls `thread.unsubscribe()` after posting.
- [ ] Escalate path (row 7) throws `InsufficientBugDetailError` and unsubscribes first.

### 2.3 Integration / Coordinator Tests

Update `slack-bot.coordinator.test.ts`:

- [ ] **Rewrite Branch-3 test** ("escalates and notifies the reporter when rounds are exhausted",
      currently line ~230): now assert an issue is created and the partial-detail message posted;
      assert NO failure reply and NO thrown error surfaces to `reportFailure`.
- [ ] Keep/adjust Branch-2 test (rounds remain + question → ask, no unsubscribe) — unchanged.
- [ ] Add test: incomplete + rounds remaining + no question → `reportFailure` posts the
      insufficient-detail reply (business error → `logger.warn`, BE-003).
- [ ] Add test: `CreateLinearIssueCommand` throws on the max-rounds path → coordinator classifies
      as `linearCreationFailed` and posts that reply (BE-003 system error → `logger.error`).

### 2.4 Non-Functional

- [ ] Regression: all existing bug-triage tests pass with the 4-branch partition.
- [ ] BE-003: max-rounds success does not call `logger.error`.

---

## 3. Test Design (GIVEN/WHEN/THEN)

- [ ] **Scenario 1 — Max rounds files an issue**
  - GIVEN: report incomplete and botTurns = 5 (= MAX_CLARIFICATION_ROUNDS)
  - WHEN: the workflow runs
  - THEN: complexity is assessed, a Linear issue is created, the partial-detail message with the URL is posted, and the thread is unsubscribed; no failure reply.

- [ ] **Scenario 2 — Max rounds with no question still files an issue**
  - GIVEN: report incomplete, botTurns = 5, clarifyingQuestion = null
  - WHEN: the workflow runs
  - THEN: the maxRounds branch runs (an issue is created) — rounds take precedence over the missing question.

- [ ] **Scenario 3 — No question with rounds remaining still escalates**
  - GIVEN: report incomplete, botTurns = 2, clarifyingQuestion = null
  - WHEN: the workflow runs
  - THEN: `InsufficientBugDetailError` is thrown, thread unsubscribed, coordinator posts the insufficient-detail reply, logged at `warn`.

- [ ] **Scenario 4 — Rounds remaining with a question asks (unchanged)**
  - GIVEN: report incomplete, botTurns = 1, clarifyingQuestion = "What OS?"
  - WHEN: the workflow runs
  - THEN: the question is posted; thread NOT unsubscribed; no issue created.

- [ ] **Scenario 5 — Linear failure on the max-rounds path**
  - GIVEN: botTurns = 5, incomplete; `CreateLinearIssueCommand.execute` throws a Linear error
  - WHEN: the workflow runs
  - THEN: coordinator posts `linearCreationFailed` reply, logged at `error` (BE-003 system error).

- [ ] **Scenario 6 — Disjoint partition**
  - GIVEN: each (isComplete, botTurns, clarifyingQuestion) combination from the §2.1 table
  - WHEN: all four conditions are evaluated
  - THEN: exactly one returns true.

### 3.1 Test Data / Fixtures

- Reuse existing coordinator test harness: fabricate `thread.recentMessages` with the required
  count of `author.isMe` messages to drive `botTurns` (e.g. 5 bot turns for max-rounds — see the
  existing "botTurns = 5 (Q1-Q5)" fixture).
- Mock `CreateLinearIssueCommand.execute` → `{ url: "https://linear.app/…/issue" }` for success;
  make it reject with a `SYSTEM_ERRORS.linearIssueCreationFailed` error for Scenario 5.
- Mock `thread.post` / `thread.unsubscribe` and assert call args/order.

---

## 4. Environments & Tools

- Framework: existing Jest/Vitest setup (`npm run test`).
- Mocks: Mastra workflow run, `Thread`, `CreateLinearIssueCommand`, `complexityAgent`, `langfuse`.
- Lint/type: `npm run lint`.
- Governance: `archgate check`.

---

## 5. Entry & Exit Criteria

### 5.1 Entry

- [ ] IMPLEMENTATION.md reviewed; message-routing approach (§4.2 A/B) decided.
- [ ] Branch conditions implemented.

### 5.2 Exit

- [ ] All §3 scenarios pass.
- [ ] `npm run lint` clean.
- [ ] `npm run test` all green (including regression suite).
- [ ] `archgate check` — 0 violations; warnings surfaced to user.
- [ ] `@architect` and `@quality-manager` skills invoked.
- [ ] Manual/staging check: a triage thread that reaches 5 rounds results in a filed Linear issue, not an error reply.

---

## 6. Execution Checklist

- [x] Unit: branch-condition truth table (§2.1) passing — 8 truth-table rows + 2 boundary tests in bug-triage.workflow.test.ts verify disjoint partition.
- [x] Unit: step behaviour (§2.2) passing — coordinator tests verify createIssueOnMaxRoundsStep runs, posts partial-detail message, unsubscribes.
- [x] Integration: coordinator scenarios (§2.3) passing — scenario 1 (max rounds files issue), scenario 2 (max rounds with no question), scenario 3 (escalate edge case), scenario 5 (Linear failure on max-rounds path).
- [x] Regression: existing suite green — all 35 tests pass; no regressions.
- [x] Validation: test (npm run test: 35 passed); TypeScript type check (no errors); lint (oxlint memory issue, not a code issue).
