# Test Plan — Mastra Agent Integration (Slack Triage)

## 1. Overview

### 1.1 Test Objectives

- Confirm the Mastra-backed `EvaluateBugReportQuery` produces the **same** `{ isComplete,
clarifyingQuestion }` contract as the previous `generateObject` implementation.
- Confirm the Slack triage clarification loop (Chat SDK) behaves identically end-to-end.
- Confirm Mastra wiring (`MastraModule` in `AppModule`, util singleton) boots the NestJS app
  without regressions and exposes **no** unintended public routes.
- Confirm the triage system prompt is sourced from **Langfuse** (fetched + compiled), that the
  prompt version is linked to the trace, and that the **local fallback** works when Langfuse fails.
- Confirm `archgate check`, lint, build, and existing tests all pass.

### 1.2 Test Scope

- In scope: `EvaluateBugReportQuery`, `bug-triage.agent`, `src/util/mastra.ts`,
  `src/util/langfuse.ts` (client + prompt fetch/compile + fallback), `AppModule` bootstrap,
  `SlackBotCoordinator` behaviour, Slack→Linear happy path, Langfuse prompt fetch + fallback.
- Out of scope (and why): Claude Agent SDK code-implementation pipeline (`agent.ts`) — unchanged;
  durable storage — in-memory only; Mastra playground/deploy tooling — not adopted.

---

## 2. Test Strategy

### 2.1 Test Levels

#### 2.1.1 Unit Tests

- Target modules:
  - `evaluate-bug-report.query.test.ts` — updated to mock the Mastra agent, assert output shape.
  - `bug-triage.agent` — assert config (name, model id, output schema) is correctly registered.
  - `langfuse.test.ts` (util) — mock Langfuse: assert prompt fetched + compiled, and that the
    local fallback is returned (with a logged warning) when the fetch throws.
  - `slack-bot.coordinator.test.ts` — unchanged behaviour with mocked query.
- Key cases:
  - Incomplete report → `{ isComplete:false, clarifyingQuestion: <non-null> }`.
  - Complete report → `{ isComplete:true, clarifyingQuestion:null }`.
  - Message role mapping (`author.isMe` → assistant/user) preserved.
- Edge cases:
  - Empty `recentMessages`.
  - Agent returns malformed/partial object → schema validation error handled.
  - Max clarification rounds reached → fallback path (coordinator).

#### 2.1.2 Integration Tests

- [ ] Components / APIs involved: NestJS bootstrap with `MastraModule` + `SlackBugIntakeModule`.
- [ ] Scenarios:
  - App boots (`createApp()`) with Mastra registered; DI resolves `EvaluateBugReportQuery`.
  - Route dump asserts no unintended public Mastra agent/workflow endpoints.

#### 2.1.3 End‑to‑End (E2E) / UI Tests

- [ ] User flows (via `npm run dev:local` + localtunnel, real Slack workspace):
  - Mention bot with incomplete bug report → bot asks a clarifying question in-thread.
  - Provide details → bot creates Linear issue and posts the URL.
  - Reach max rounds without completion → bot posts fallback message and unsubscribes.

#### 2.1.4 Non‑Functional Tests

- [ ] Performance: Slack event ack within 3s (webhook ack decoupled from agent call).
- [ ] Security: no new secrets; no new public endpoints; signature verification intact.
- [ ] Reliability / Regression: promptfoo eval (`npm run eval`) parity on triage prompts;
      full `npm run test` green; `npm run lint` (incl. `archgate check` + build) clean.

---

## 3. Test Design

### 3.1 Test Scenarios

- [ ] Test Scenario 1 — Triage output parity
  - GIVEN: a transcript that previously yielded `isComplete:false` + a clarifying question
  - WHEN: `EvaluateBugReportQuery.execute()` runs via the Mastra agent
  - THEN: it returns the same `isComplete` and a non-null `clarifyingQuestion`

- [ ] Test Scenario 2 — Complete report creates issue
  - GIVEN: a transcript with reproduction steps, environment, expected/actual behaviour
  - WHEN: the coordinator processes the incoming thread
  - THEN: `isComplete:true`, a Linear issue is created, URL posted, thread unsubscribed

- [ ] Test Scenario 3 — App boots with Mastra, no public routes
  - GIVEN: `MastraModule.register({ mastra })` added to `AppModule`
  - WHEN: the NestJS app is created and routes are enumerated
  - THEN: app boots cleanly and no unintended public Mastra endpoints are mounted

- [ ] Test Scenario 4 — ADR compliance
  - GIVEN: the full change set
  - WHEN: `npm run lint` (`archgate check` + build) runs
  - THEN: zero violations; warnings surfaced; layer boundaries (BE-001) respected

- [ ] Test Scenario 5 — Prompt sourced from Langfuse + trace linked
  - GIVEN: a `bug-triage-system` prompt exists in Langfuse (production label)
  - WHEN: a triage turn runs
  - THEN: the agent uses the Langfuse prompt text, and the trace shows the linked prompt version

- [ ] Test Scenario 6 — Langfuse fallback
  - GIVEN: Langfuse is unreachable or the prompt name is invalid
  - WHEN: `langfuse.fetchTriagePrompt()` (util) runs
  - THEN: the local default prompt is returned, a warning is logged, and triage still works

### 3.2 Test Data

- Golden Slack transcripts (incomplete / complete / borderline) — reuse existing promptfoo fixtures
  under `prompts/` and `promptfooconfig.yaml`.
- Mocked Mastra agent responses for unit tests (no live API calls).
- Test Slack channel + Linear project with the `agent` label for E2E.

---

## 4. Environments & Tools

- Test environments: local (`npm run dev:local` + localtunnel) → fly.io staging/prod.
- Builds / versions under test: current branch with pinned `@mastra/core` + `@mastra/nestjs`.
- Automation framework / tools: Vitest (`vp test`), promptfoo (`npm run eval`), oxlint, `archgate check`.
- Monitoring / logging: Pino `logger`; `npm run deploy:logs` (fly.io); **Langfuse dashboard**
  (traces + prompt versions).
- Langfuse project with a `bug-triage-system` prompt (production label) and `LANGFUSE_*` env vars
  set for local + CI.

---

## 5. Entry & Exit Criteria

### 5.1 Entry Criteria

- IMPLEMENTATION.md tasks 1–7 complete; build compiles; Mastra deps installed.

### 5.2 Exit Criteria

- All unit + integration tests pass; E2E happy path verified in Slack.
- `npm run lint` (incl. `archgate check`) passes with zero violations; warnings reported.
- promptfoo triage parity within accepted threshold; no open blocker defects.
- Sign-off: reviewer via code-review skill.
