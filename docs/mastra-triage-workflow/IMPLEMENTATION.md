# Implementation Plan — Migrate Slack Triage Loop to Mastra Workflow

## 1. Overview

### 1.1 Goals

- Replace the **procedural orchestration** currently inside `SlackBotCoordinator`
  (`handleIncoming` → `evaluateAndLogReport` → `respondToBugReport`) with a
  **Mastra Workflow** using the `createWorkflow` / `createStep` / `.branch()` API.
- Keep the "receive Slack message → evaluate → clarify-or-create-issue" loop as
  first-class, versionable workflow steps instead of hand-written `if/else`.
- Preserve existing layers: `bugTriageAgent`, `EvaluateBugReportQuery`,
  `CreateLinearIssueCommand`, and all Transfers are reused unchanged.

### 1.2 Non-Goals

- **No Mastra tools.** We use the Workflow feature only (per decision).
- **Do NOT touch** the Claude Agent SDK code-implementation step (`src/agent.ts`)
  mandated by ARCH-001. That pipeline stays exactly as-is.
- No durable/suspend-resume workflow. The loop stays event-driven (one workflow
  run per inbound Slack event); conversation history remains in the Chat SDK
  thread. `MastraProvider` keeps its in-memory storage.
- No change to Slack webhook ingestion (`handleWebhook`) or the events controller.

---

## 2. Requirements

### 2.1 Functional Requirements

- [x] FR1: On each inbound Slack event, a Mastra workflow run evaluates the thread
      via `EvaluateBugReportQuery` and produces `{ isComplete, clarifyingQuestion, botTurns }`.
- [x] FR2: When `isComplete` is true, the workflow creates a Linear issue via
      `CreateLinearIssueCommand`, posts the issue URL to the thread, and unsubscribes.
- [x] FR3: When not complete, `botTurns < MAX_CLARIFICATION_ROUNDS`, and a
      clarifying question exists, the workflow posts the question (no unsubscribe).
- [x] FR4: When rounds are exhausted or no question is available, the workflow
      posts `FALLBACK_MESSAGE` and unsubscribes.
- [x] FR5: Behaviour is byte-for-byte equivalent to the current coordinator logic,
      including logging semantics and error swallowing in `handleIncoming`.

### 2.2 Non-Functional Requirements

- [x] Reliability: A workflow-step failure must be caught and logged exactly like
      today's `handleIncoming` try/catch (never crash the process on a bad event).
- [x] Security: No secrets in code/logs; continue to rely on env-provided tokens.
- [x] Maintainability (BE-001): Workflow = Coordinator-layer orchestration; steps
      call Query/Command only. No business/side-effect logic duplicated into steps.
- [ ] Governance (GEN-001): Workflow/step ids centralised in constants (no magic
      strings in business logic).

---

## 3. Architecture & Design

### 3.1 High-Level Design

A Mastra workflow _is_ orchestration, so it maps to the **Coordinator layer** in
BE-001. The workflow's steps call the existing Query and Command, matching
BE-001's "coordinator orchestrates query then command" pattern.

Dependencies that steps need at runtime — the Chat SDK `thread`, the injected
`EvaluateBugReportQuery`, and `CreateLinearIssueCommand` — are supplied per run
via Mastra `runtimeContext`, populated by `SlackBotCoordinator` before
`run.start(...)`. This preserves NestJS DI and avoids duplicating side effects.

```
inbound Slack event
  └─ SlackBotCoordinator.handleIncoming
       ├─ thread.refresh()
       ├─ build runtimeContext { thread, evaluateBugReport, createLinearIssue }
       └─ mastra.getWorkflow('bugTriage').createRun().start(...)
            └─ bugTriageWorkflow
                 .then(evaluateStep)          // EvaluateBugReportQuery → {isComplete, question, botTurns}
                 .branch([
                   [isComplete,        createIssueStep],  // Command → post(url) → unsubscribe
                   [askCondition,      askStep],          // post(question)
                   [always (else),     fallbackStep],     // post(FALLBACK) → unsubscribe
                 ])
                 .commit()
```

Confirmed available in `@mastra/core@1.49.0`: `createWorkflow`, `createStep`,
`.then()`, `.branch()`, `.commit()`.

### 3.2 Affected Components

- Services: NestJS `SlackBugIntakeModule`.
- Modules / Packages: `@mastra/core/workflows`, existing `@mastra/core` agent.
- Files:
  - **New** `src/slack-bug-intake/workflow/bug-triage.workflow.ts`
  - **Edit** `src/util/mastra.ts` — register workflow in `MastraProvider`.
  - **Edit** `src/slack-bug-intake/coordinator/slack-bot.coordinator.ts` — start
    workflow; remove `evaluateAndLogReport` / `respondToBugReport` decision logic.
  - **Edit** `src/constants/mastra.constants.ts` — add `WORKFLOW_NAMES` (+ step ids).
  - **Edit** `src/slack-bug-intake/slack-bug-intake.module.ts` — adjust providers
    if the coordinator's dependency set changes.
  - **Docs** `docs/adr/ARCH-001-production-architecture.md` — update the intake
    portion of the sequence diagram (Claude step unchanged).
- DB / Storage: none (Mastra storage stays in-memory).
- External APIs: Slack (post/unsubscribe), Linear (issue create) — via existing
  Transfers/Command only.

### 3.3 Data Model / API Changes

- No HTTP API changes. No DB changes.
- Internal contracts (zod):
  - Workflow input: `{ /* nothing required; deps via runtimeContext */ }` or a
    minimal `{}` schema; `recentMessages` accessed through runtimeContext-injected
    query. (Finalise during implementation — prefer passing `recentMessages`
    count only if needed for `botTurns`.)
  - `evaluateStep` output: `{ isComplete: boolean, clarifyingQuestion: string | null, botTurns: number }`.
  - Reuse `EvaluationSchema` from `bug-triage.agent.ts` where applicable.

---

## 4. Implementation Plan

### 4.1 Tasks & Milestones

- [x] Task 1: Add `WORKFLOW_NAMES` and step-id constants to `mastra.constants.ts`.
- [x] Task 2: Create `bug-triage.workflow.ts` — `evaluateStep`, `createIssueStep`,
      `askStep`, `fallbackStep`, wired with `.then().branch().commit()`; deps read
      from `runtimeContext`.
- [x] Task 3: Register workflow in `MastraProvider` (`workflows: { ... }`).
- [x] Task 4: Refactor `SlackBotCoordinator` to build `runtimeContext` and start
      the workflow run; delete migrated decision helpers; keep try/catch logging and
      `handleWebhook` unchanged.
- [x] Task 5: Update `SlackBugIntakeModule` providers as needed.
- [x] Task 6: Update tests (see TEST.md) — coordinator test + new workflow test.
- [x] Task 7: Update ARCH-001 sequence diagram (intake loop only).
- [x] Task 8: `npm run lint`, `npm run test`, `archgate check`; then invoke
      `@architect` and `@quality-manager`.

### 4.2 Rollout Strategy

- Environment order: local (`npm run dev:local`) → deploy to fly.io (`npm run deploy`).
- Feature flags: none — behaviour-preserving refactor.
- Migration steps: none (stateless, in-memory).

### 4.3 Risks & Mitigations

- Risk: NestJS DI vs. module-scope Mastra steps.
  - Impact: Steps can't `@Inject` the Query/Command directly.
  - Mitigation: Pass instances via `runtimeContext` from the coordinator per run.
- Risk: `runtimeContext` typing / `.branch()` condition signatures differ from
  assumptions in `@mastra/core@1.49.0`.
  - Impact: Compile/runtime errors.
  - Mitigation: Verified API surface exists; confirm exact signatures against
    installed `.d.ts` during implementation before finalising.
- Risk: Behaviour drift (logging, unsubscribe order, error swallowing).
  - Impact: Subtle regressions in triage UX.
  - Mitigation: FR5 parity requirement + regression tests mirroring current cases.

---

## 5. Monitoring & Operations

- Logs: keep existing `[slack-triage]` log lines (evaluated / created / posting
  question / fallback); emit within steps so parity holds. Watch via `fly logs`.
- Langfuse: triage-agent traces continue via the agent; no workflow-tracing
  requirement added here.
- Alerts: none new.
- Runbook note: workflow is per-event and stateless — no stuck-run cleanup needed.
