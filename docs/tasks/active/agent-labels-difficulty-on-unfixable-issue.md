# Bug Triage Workflow Attaches a Difficulty Label to Created Issues

## 1. Plan Overview

Extend the **bug triage workflow** (`src/slack-bug-intake/workflow/bug-triage.workflow.ts`)
so that when a complete bug report is turned into a Linear issue, the workflow
first **assesses the problem's complexity** and attaches a **difficulty label** —
`easy`, `medium`, or `hard` — to the created issue (in addition to the existing
`agent` label).

The assessment happens at **triage / issue-creation time**, on the completion
branch, before the downstream Claude Agent SDK pipeline ever picks the issue up.

## 2. Why It Is Needed

- **Pain:** The automated agent produces **poor-quality results on hard
  problems** — it is not that the agent "suspends", it is that complex issues
  should be recognized _up front_ and flagged.
- **Solution:** During triage, evaluate complexity and tag the Linear issue with
  a difficulty label (`hard` / `medium` / `easy`) at the moment the issue is
  created.
- **Expected:** The bug triage workflow includes a complexity-assessment step and
  the created Linear issue carries a difficulty label. Humans (or later routing
  logic) can then decide which issues the agent should attempt vs. which need a
  human — improving overall result quality.

> Scope note: this task is **only** the triage-side labeling. What consumers do
> with the label (e.g. skip `hard` in the agent pipeline) is a follow-up.

## 3. Current Behaviour (baseline)

- `bug-triage.workflow.ts`: `evaluateStep` → `.branch([...])`.
  On the completion branch it runs **`createIssueStep`**, which calls
  `CreateLinearIssueCommand.execute(thread.recentMessages)`.
- `CreateLinearIssueCommand` (`src/slack-bug-intake/command/create-linear-issue.command.ts`):
  - `generateObject` (AI SDK, `claude-haiku-4-5`) with `langfuse.fetchFormatPrompt()`
    → `{ title, description }`.
  - `linearTransfer.createIssue({ title, description, labelNames: [LINEAR_AGENT_LABEL], stateName: LINEAR_STATES.todo })`.
- Every created issue carries exactly one label: `agent`. No difficulty signal.

## 4. Target Behaviour

On the **completion branch only** (report is complete → issue is created), the
workflow assesses difficulty and passes it into issue creation:

```
evaluateStep
  └─ .branch([
       [isCompletionCondition,        assessComplexityStep → createIssueStep],  // CHANGED
       [hasQuestionAndRoundsCondition, askStep],
       [fallbackCondition,             escalateStep],
     ])

assessComplexityStep : recentMessages → { difficulty: "easy"|"medium"|"hard" }   [NEW]
createIssueStep      : { difficulty } → CreateLinearIssueCommand.execute(msgs, difficulty)
                       → labelNames: [agent, <difficulty>]                         [CHANGED]
```

The ask / escalate branches are **unchanged**.

## 5. Architecture & Design (ADR-aligned)

Follows the existing workflow conventions (**ARCH-001**, **BE-001**): the
workflow is Coordinator-layer orchestration; each **step calls a Query/Command
only**; dependencies are injected via `requestContext` (as `evaluateStep` and
`createIssueStep` already do). Difficulty is threaded **step → step** through the
zod output schema, exactly like `evaluateStep` passes `EvaluationResultSchema`
to the branch.

```
src/
  slack-bug-intake/
    workflow/
      bug-triage.workflow.ts               ← add assessComplexityStep, wire completion branch
    query/
      assess-complexity.query.ts           ← NEW: LLM classifies difficulty
    command/
      create-linear-issue.command.ts       ← accept difficulty, add it to labelNames
    slack-bug-intake.constants.ts          ← DIFFICULTY_LABELS
  constants/
    mastra.constants.ts                    ← WORKFLOW_STEP_IDS.assessComplexity, LANGFUSE_PROMPT_NAMES.complexity
  util/
    langfuse.ts                            ← fetchComplexityPrompt (fetch-with-local-fallback)
```

### 5.1 `assessComplexityStep` (new workflow step)

- Mirror `createIssueStep`'s shape: pulls `thread` + a new `assessComplexity`
  query from `requestContext`, calls the query on `thread.recentMessages`,
  returns `{ difficulty }`.
- `inputSchema`: `EvaluationResultSchema` (the branch input); `outputSchema`:
  `ComplexityResultSchema = z.object({ difficulty: DifficultySchema })` where
  `DifficultySchema = z.enum(["easy","medium","hard"])`.
- Logs with the existing `[slack-triage]` prefix (`difficulty=<value>`).
- Export the step (and schemas) for unit testing, like the other steps.

### 5.2 Wiring the completion branch

- The completion branch must run **two** steps in order
  (`assessComplexityStep` then `createIssueStep`). Compose them as a small
  sequence and use it as the branch target (a nested `createWorkflow(...).then(assessComplexityStep).then(createIssueStep).commit()`,
  or Mastra step chaining) so the existing `.branch([...])` disjoint-partition
  property is preserved — the completion condition still selects exactly one
  target. **Keep the three conditions mutually exclusive & exhaustive**
  (ARCH-001 "Do").

### 5.3 Complexity assessment (Query)

- New `AssessComplexityQuery` — a **separate LLM call** (AI SDK `generateObject`),
  schema `z.object({ difficulty: z.enum(["easy","medium","hard"]) })`.
- **Independent model selection:** the assessment model is decoupled from the
  format model so they can change independently. Add a dedicated constant, e.g.
  `AGENT_MODELS.complexity` in `src/constants/mastra.constants.ts` (alongside
  `AGENT_MODELS.bugTriage`); do not reuse the format command's hardcoded model.
- Input: `thread.recentMessages` **text only** (no repo/context hints).
- **ARCH-001 / Langfuse rule:** system prompt fetched via a new
  `langfuse.fetchComplexityPrompt()` (fetch-with-local-fallback), registered in
  `LANGFUSE_PROMPT_NAMES` with a matching local fallback template. **Do not
  inline the prompt.**
- Input: `thread.recentMessages` (same input the format/evaluate steps consume).

### 5.4 `CreateLinearIssueCommand` change

- New optional param `difficulty` on `execute(recentMessages, difficulty)`.
- Build `labelNames: [LINEAR_AGENT_LABEL, DIFFICULTY_LABELS[difficulty]]`
  (agent label preserved; difficulty additive). If `difficulty` is absent,
  behaviour is unchanged (`[LINEAR_AGENT_LABEL]`) — keeps existing tests green
  and provides graceful degradation.
- Reuse `LinearTransfer.createIssue` / `resolveLabelIds` — **resolve labels by
  name, never hardcode ids** (matches the current `agent` flow).

### 5.5 Constants (GEN-001 — no magic strings)

```ts
// src/slack-bug-intake/slack-bug-intake.constants.ts
export const DIFFICULTY_LABELS = { easy: "easy", medium: "medium", hard: "hard" } as const;

// src/constants/mastra.constants.ts
WORKFLOW_STEP_IDS = { /* ...existing */ assessComplexity: "assess-complexity" };
LANGFUSE_PROMPT_NAMES = { /* ...existing */ complexity: "issue-complexity-system" };
```

## 6. Constraints / ADR Compliance Checklist

- [x] **BE-001**: assessment = Query, issue creation = Command; the step only
      orchestrates. No business logic in the step/transfer/constants.
- [x] **ARCH-001**: implemented as Mastra workflow steps; branch conditions stay
      mutually exclusive & collectively exhaustive; complexity prompt routed
      through Langfuse fetch-with-fallback; prompt name in `LANGFUSE_PROMPT_NAMES`.
- [x] **GEN-001**: step id, difficulty label names, prompt name are constants.
- [x] **BE-003**: an `assessComplexityStep` failure is logged via `logger` and
      must **not** block issue creation — degrade to creating the issue with the
      `agent` label only (assessment is an enhancement, not a gate).
- [x] `agent` label + Todo-state semantics on creation preserved.
- [x] `ask` / `escalate` branches untouched.

## 7. Resolved Decisions

1. **Separate LLM call** — difficulty is assessed by its own `AssessComplexityQuery`,
   NOT folded into the format call. The assessment model is configured
   independently (`AGENT_MODELS.complexity`) so the assessing model and the
   format model can change separately. ✅
2. **Signal source = report text only** (`thread.recentMessages`); no repo/context
   hints. ✅
3. **Taxonomy** fixed at `easy / medium / hard` (no 4th bucket). ✅

## 8. Test Plan (high-level)

- Unit (step): `assessComplexityStep` with mocked `requestContext` returns a
  valid `{ difficulty }`; logs the value. (Same style as existing step tests.)
- Unit (query): `AssessComplexityQuery` returns a valid enum; falls back safely
  on LLM/Langfuse error.
- Unit (command): `CreateLinearIssueCommand.execute(msgs, "hard")` calls
  `createIssue` with `labelNames: ["agent", "hard"]`; with no difficulty →
  `["agent"]` (existing test stays green).
- Unit (workflow): completion branch runs assess → create in order; ask/escalate
  branches unchanged; conditions remain a disjoint partition.
- Follow repo test conventions (`docs/E2E-guidance.md`, BE-004).
