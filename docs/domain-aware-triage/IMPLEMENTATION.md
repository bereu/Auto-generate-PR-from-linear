# Implementation Plan — Domain-aware Bug Triage (minimal doc reading)

## 1. Overview

### 1.1 Goals

- Let the bug-triage flow consult the DDD domain docs in `docs/domain/*` so both the
  completeness/clarifying-question stage and the complexity-assessment stage are domain-aware.
- Reading MUST be minimal: the agent **lists/searches** the docs first, then reads only the
  1–2 relevant bounded-context doc(s) — never all files.
- Use **Mastra's native file-reading feature** (`Workspace` + `LocalFilesystem`) to give the
  agent read-only, directory-scoped `list`/`read`/`search` tools — no hand-rolled fs code.

### 1.2 Non-Goals

- Generating the domain docs themselves (already added under `docs/domain/`).
- Vector/embedding retrieval — agentic manifest-driven selection is sufficient.
- Changing the Linear/GitHub downstream pipeline (ARCH-001 stays intact).

---

## 2. Requirements

### 2.1 Functional Requirements

- [ ] FR1: A read-only Mastra `Workspace` (`LocalFilesystem`, `basePath = docs/domain`) is attached to the triage agent, exposing native `list`/`read`/`search` file tools.
- [ ] FR2: The agent can list and/or keyword-search `docs/domain` to discover which bounded-context doc is relevant before reading any body.
- [ ] FR3: File tools are directory-scoped and read-only — paths outside `docs/domain` and any write are blocked by Mastra natively.
- [ ] FR4: `EvaluateBugReportQuery` (via `bugTriageAgent`) can use these tools while judging completeness / forming clarifying questions.
- [ ] FR5: `assessComplexityStep` can use these tools while judging difficulty (easy/medium/hard).
- [ ] FR6: When `docs/domain` is empty/absent, tools return empty results and triage proceeds unchanged.

### 2.2 Non-Functional Requirements

- [ ] Performance: agent lists/searches first (cheap) and reads ≤2 full docs per triage turn.
- [ ] Security: directory jail + read-only enforced by Mastra's `LocalFilesystem({ readOnly: true })`; agent cannot escape `docs/domain` or write.
- [ ] Reliability: file-tool failures/empty dir degrade to "no domain context" so triage never blocks (BE-003).
- [ ] UX: clarifying questions and difficulty labels become more accurate/domain-specific.

---

## 3. Architecture & Design

### 3.1 High-Level Design

- Build one read-only `Workspace` (`new Workspace({ filesystem: new LocalFilesystem({ basePath: DOMAIN_DOCS_DIR, readOnly: true }) })`) from `@mastra/core/workspace`.
- Attach it to `bugTriageAgent` (evaluation stage) and to a new tool-capable complexity agent (complexity stage) via the agent's `workspace` option — Mastra auto-provides `list`/`read`/`search` tools.
- Prompts route through the Langfuse fetch-with-local-fallback util under existing `LANGFUSE_PROMPT_NAMES` (ARCH-001); only local fallback templates change to instruct minimal reading (list/search first, read ≤2 relevant docs).
- Diagram link: `docs/domain/agent-llm-context-map.mmd` (existing domain context map).

### 3.2 Affected Components

- Services: none new (single NestJS process).
- Modules / Packages:
  - New: `src/slack-bug-intake/agent/domain-docs.workspace.ts` (shared read-only `Workspace` instance)
  - Edit: `src/slack-bug-intake/agent/bug-triage.agent.ts` (attach `workspace`)
  - Edit: `src/slack-bug-intake/workflow/bug-triage.workflow.ts` (complexity agent w/ `workspace`, replaces inline `generateObject`)
  - Edit: `src/slack-bug-intake/slack-bug-intake.constants.ts` (`DOMAIN_DOCS_DIR` + prompt fallbacks)
  - Edit: `src/constants/mastra.constants.ts` (`AGENT_NAMES.complexity`)
- DB / Storage: none (reads local files under `docs/domain/`).
- External APIs / Integrations: none new; Langfuse prompt fallbacks updated only.

### 3.3 Data Model / API Changes

- No new domain types, HTTP API, or RDB changes.
- No manifest file needed — native `list`/`search` replaces the previously planned `index.json` index.

---

## 4. Implementation Plan

### 4.1 Tasks & Milestones

- [x] Task 1: Add constants `DOMAIN_DOCS_DIR` and `AGENT_NAMES.complexity`.
- [x] Task 2: Create the shared read-only `Workspace` (`domain-docs.workspace.ts`).
- [x] Task 3: Attach `workspace` to `bugTriageAgent`; update `TRIAGE_SYSTEM_PROMPT` fallback for minimal reading (list/search first, read ≤2 relevant docs).
- [x] Task 4: Add tool-capable complexity agent with the same `workspace`; replace inline `generateObject` in `assessComplexityStep`; keep `FALLBACK_DIFFICULTY` degrade; update `COMPLEXITY_SYSTEM_PROMPT` fallback.
- [x] Task 5: Verify `basePath` resolves correctly from the process CWD on fly.io (docs shipped in the image); adjust path if needed.
- [x] Task 6: Tests (see TEST.md); run `npm run lint`, `npm run test`, `archgate check`.

### 4.2 Rollout Strategy

- Environment order: local (`npm run dev:local`) → fly.io deploy.
- Feature flags: none; behaviour is additive and degrades to prior behaviour when no docs are present.
- Migration steps: ensure `docs/domain/` is present in the deployed image (build/copy step).

### 4.3 Risks & Mitigations

- Risk: Extra tool-call loop increases latency/token cost per triage turn.
  - Impact: Slower clarification; higher LLM spend.
  - Mitigation: Prompt caps reads to ≤2 docs; agent lists/searches (cheap) before reading bodies.
- Risk: `docs/domain/` not present in the deployed image (it is gitignored).
  - Impact: Agent sees no domain context.
  - Mitigation: Add a build step to include the docs; tools degrade to empty so triage still works.
- Risk: Path escape / accidental writes.
  - Impact: Reading/altering files outside scope.
  - Mitigation: `LocalFilesystem({ basePath, readOnly: true })` — Mastra enforces the jail + read-only.

---

## 5. Monitoring & Operations

- Logs / metrics: `[slack-triage]` log lines already emitted; add debug logs for docs listed/read and any degrade.
- Alerts: none new; rely on existing workflow-`failed` handling + Langfuse traces.
- Runbooks: to refresh the index after domain docs change, run `npm run gen:domain-index`.
