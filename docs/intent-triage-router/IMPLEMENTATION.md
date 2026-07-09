# Implementation Plan — Intent-aware Triage Router

## 1. Overview

### 1.1 Goals

- Add an **intent classification** front-door to the Slack intake flow so an incoming
  message is routed by what the user actually wants:
  - **question** → the bot answers directly in-thread and **stays subscribed** for follow-ups.
  - **bug** → the existing bug clarification loop → create a Linear issue (`agent`, difficulty label).
  - **feature-request** → a clarification loop (same shape as bugs) → create a Linear issue
    (`agent` + `feature` label).
- Reuse the existing Mastra workflow + NestJS CQRS layering; classification runs **every turn**
  (the workflow is stateless per run, and the full thread context keeps the intent stable).

### 1.2 Non-Goals

- Persisting a locked intent per thread (we re-classify each turn instead of storing state).
- Generating/maintaining the `docs/domain/*` docs themselves (already handled elsewhere).
- Answering questions from a vector store / RAG — the domain-docs workspace (list/read/search)
  plus general model knowledge is sufficient.
- Changing the downstream Linear-webhook → coding-agent pipeline.

---

## 2. Requirements

### 2.1 Functional Requirements

- [ ] FR1: On every incoming mention/subscribed message, classify the thread as
      `question | bug | feature_request` (ClassifyMessageQuery).
- [ ] FR2 (question): Generate an answer using the domain-docs workspace **and** general
      knowledge, post it to the thread, and **remain subscribed** (do not unsubscribe).
- [ ] FR3 (bug): Preserve current behaviour — evaluate completeness, ask clarifying questions
      (up to `MAX_CLARIFICATION_ROUNDS`), assess complexity, create a Linear issue with the
      `agent` + difficulty labels, post the URL, unsubscribe.
- [ ] FR4 (feature-request): Run a clarification loop with **feature-specific** completeness
      criteria (problem / motivation / acceptance criteria), then create a Linear issue with
      `agent` + `feature` labels, post the URL, unsubscribe.
- [ ] FR5: All prompts resolved from Langfuse with a local fallback (ARCH-001).
- [ ] EC1: Classification LLM failure → **fall back to `bug`** (never lose a report), logged at
      `warn` (BE-003), and continue into the bug intake loop.
- [ ] EC2: Answer generation failure → post a graceful apology, stay subscribed, log `warn` (BE-003).
- [ ] EC3: Feature completeness never reached within `MAX_CLARIFICATION_ROUNDS` → best-effort
      issue created (mirrors the bug max-rounds path).
- [ ] EC4: Complexity assessment failure → `FALLBACK_DIFFICULTY` (unchanged, BE-003).

### 2.2 Non-Functional Requirements

- [ ] Performance: Classification uses the cheap Haiku model; one extra LLM call per turn.
- [ ] Security: Domain-doc reads stay whitelisted to `docs/domain` (existing workspace guard);
      no secrets/PII in Rollbar payloads (BE-003).
- [ ] Reliability: Every new branch degrades gracefully (EC1–EC4); intake never hard-fails silently.
- [ ] UX: Question answers are concise and cite domain context when relevant; issue-created
      replies include the Linear URL.

---

## 3. Architecture & Design

### 3.1 High-Level Design

Insert a `classifyStep` at the front of the workflow and branch by intent. The existing
evaluate→clarify→complexity→create-issue chain is wrapped into a reusable **intake** nested
workflow so the bug and feature paths share the same shape, differing only by their
completeness prompt, issue labels, and closing messages.

```
Slack mention / subscribed reply
  └─ classifyStep (ClassifyMessageQuery → { intent })
       ├─ intent == question         → answerQuestionStep (AnswerQuestionQuery; post; STAY subscribed)
       ├─ intent == bug              → bugIntakeWorkflow     (EvaluateBugReportQuery,     labels: agent+difficulty)
       └─ intent == feature_request  → featureIntakeWorkflow (EvaluateFeatureRequestQuery, labels: agent+feature+difficulty)
```

The branch conditions form a disjoint + exhaustive partition on `intent` (matching the
existing branch discipline in `bug-triage.workflow.ts`).

### 3.2 Affected Components

- **Coordinator**: `slack-bot.coordinator.ts` — inject and pass new queries via `RequestContext`.
- **Workflow**: `bug-triage.workflow.ts` — add `classifyStep`, `answerQuestionStep`; wrap the
  existing bug chain into `bugIntakeWorkflow`; add `featureIntakeWorkflow`; re-wire the top-level
  branch to route by intent.
- **Agents** (new): `intent-classifier.agent.ts`, `question-answer.agent.ts`,
  `feature-intake.agent.ts` (feature completeness evaluator).
- **Queries** (new): `classify-message.query.ts`, `answer-question.query.ts`,
  `evaluate-feature-request.query.ts`.
- **Command**: `create-linear-issue.command.ts` — accept a `kind: "bug" | "feature"` to choose the
  format prompt and add the `feature` label.
- **Constants**: `src/constants/mastra.constants.ts`, `slack-bug-intake.constants.ts`.
- **Util**: `src/util/langfuse.ts` — new prompt fetchers.
- **Module**: `slack-bug-intake.module.ts` — register new providers.

### 3.3 Data Model / API Changes

- No DB or HTTP API changes. Internal contract additions only:
  - `IntentSchema = z.object({ intent: z.enum(["question","bug","feature_request"]) })`.
  - `AnswerSchema = z.object({ answer: z.string() })`.
  - `EvaluationSchema` reused for feature completeness (`isComplete`, `clarifyingQuestion`).
- New Linear label: `feature` (constant `LINEAR_FEATURE_LABEL`), added alongside `agent`.

---

## 4. Implementation Plan

### 4.1 Tasks & Milestones

- [x] Task 1 — Constants (GEN-001):
  - `mastra.constants.ts`: `AGENT_NAMES.intentClassifier`, `.questionAnswer`, `.featureIntake`;
    matching `AGENT_MODELS` (Haiku); `WORKFLOW_STEP_IDS.classify`, `.answer`;
    `LANGFUSE_PROMPT_NAMES.intentClassify`, `.questionAnswer`, `.featureEvaluate`, `.featureFormat`.
  - `slack-bug-intake.constants.ts`: `INTENT_KINDS` map + `IntentKind` type; `LINEAR_FEATURE_LABEL`;
    local fallback prompts `INTENT_CLASSIFY_SYSTEM_PROMPT`, `QUESTION_ANSWER_SYSTEM_PROMPT`,
    `FEATURE_EVALUATE_SYSTEM_PROMPT`, `FEATURE_FORMAT_SYSTEM_PROMPT`;
    `buildFeatureIssueCreatedMessage(url)`, `buildAnswerFailedMessage()`.
- [x] Task 2 — Langfuse fetchers: `fetchIntentClassifyPrompt`, `fetchQuestionAnswerPrompt`,
      `fetchFeatureEvaluatePrompt`, `fetchFeatureFormatPrompt` (fetch-with-local-fallback pattern).
- [x] Task 3 — Agents (with `domainDocsWorkspace`):
  - `intent-classifier.agent.ts` → `IntentSchema`.
  - `question-answer.agent.ts` → `AnswerSchema` (domain docs + general knowledge).
  - `feature-intake.agent.ts` → reuse `EvaluationSchema`, feature completeness instructions.
- [x] Task 4 — Queries (Query layer, BE-001):
  - `ClassifyMessageQuery.execute(recentMessages) → { intent }`.
  - `AnswerQuestionQuery.execute(recentMessages) → { answer }`.
  - `EvaluateFeatureRequestQuery.execute(recentMessages) → { isComplete, clarifyingQuestion }`.
- [x] Task 5 — Command: extend `CreateLinearIssueCommand.execute(messages, difficulty?, kind="bug")`
      to select the format prompt and append `LINEAR_FEATURE_LABEL` when `kind === "feature"`.
- [x] Task 6 — Workflow:
  - Add `classifyStep` (delegates to `ClassifyMessageQuery`; on error → `bug`, BE-003).
  - Add `answerQuestionStep` (delegates to `AnswerQuestionQuery`; posts; **no** unsubscribe; on
    error posts `buildAnswerFailedMessage()`).
  - Extract the current evaluate→branch chain into `bugIntakeWorkflow`.
  - Add `featureIntakeWorkflow` mirroring it with the feature evaluate query, `feature` label, and
    `buildFeatureIssueCreatedMessage`.
  - Top-level: `.then(classifyStep).branch([question→answer, bug→bugIntake, feature→featureIntake])`.
- [x] Task 7 — Coordinator: build `RequestContext` with `classifyMessage`, `answerQuestion`,
      `evaluateFeatureRequest` (plus existing entries).
- [x] Task 8 — Module: register `ClassifyMessageQuery`, `AnswerQuestionQuery`,
      `EvaluateFeatureRequestQuery` providers.
- [x] Task 9 — Tests (BE-004) — see TEST.md.
- [x] Task 10 — Validation: `npm run lint`, `npm run test`, `archgate check`; then invoke
      `@architect` and `@quality-manager`.

### 4.2 Rollout Strategy

- Environment order: local (`npm run dev:local` + tunnel per GEN-003) → deploy (fly.io).
- No feature flag required; behaviour is additive. Existing bug reports keep working because the
  classifier falls back to `bug` on failure (EC1).
- Langfuse prompts can be created after deploy — local fallbacks cover the gap (ARCH-001).

### 4.3 Risks & Mitigations

- Risk: Classifier flips intent mid-thread (e.g. a bug reply misread as a question).
  - Impact: Wrong branch on a turn; a clarification could be answered instead of continued.
  - Mitigation: Classify against the **whole thread** (not just the latest message); prompt
    biases toward `bug`/`feature_request` once actionable detail exists; `bug` is the safe default.
- Risk: Extra LLM call per turn adds latency/cost.
  - Impact: Slightly slower replies.
  - Mitigation: Haiku model; single structured call.
- Risk: Question path staying subscribed causes the bot to answer unrelated chatter.
  - Impact: Noise in-thread.
  - Mitigation: Only mentions start a subscription; classifier can return `bug`/`feature` on a
    follow-up and route accordingly.

---

## 5. Monitoring & Operations

- Logs (all `[slack-triage]` prefixed): `classified: intent=...`, `answered question`,
  `feature intake: isComplete=...`, plus existing evaluate/complexity/issue logs.
- Rollbar (via `logger`): classification failure → `warn` + fallback; answer failure → `warn`;
  system errors → `error` (BE-003).
- Langfuse traces cover the new agents (intent-classifier, question-answer, feature-intake).
- Runbook note: if answers are low quality, tune the Langfuse `question-answer-system` prompt
  (no redeploy). If routing is wrong, tune `intent-classify-system`.
