# Test Plan — Domain-aware Bug Triage

## 1. Overview

### 1.1 Test Objectives

- Validate that the triage agent lists/searches the domain docs first and reads only the relevant doc(s).
- Validate the Mastra `Workspace` is read-only and directory-scoped, and that triage degrades gracefully when docs are absent.
- Validate both stages (completeness eval + complexity) still function with the workspace attached.

### 1.2 Test Scope

- In scope: the read-only `Workspace`/`LocalFilesystem` config, prompt-fallback wiring, complexity-step behaviour with the workspace attached.
- Out of scope (and why): Mastra's internal file-tool implementation (framework-owned, `basePath` jail + read-only are its guarantees); DDD doc content quality (authored externally); Langfuse remote fetch (covered by existing fallback util tests).

---

## 2. Test Strategy

### 2.1 Test Levels

#### 2.1.1 Unit Tests

- [x] Target modules:
  - [x] `domain-docs.workspace.ts` (config assertions)
  - [x] `evaluate-bug-report.query.ts` (updated for workspace-enabled agent)
  - [x] `bug-triage.workflow.ts` `assessComplexityStep` (complexity agent w/ workspace)
- [x] Key cases:
  - [x] The workspace is constructed with `basePath = DOMAIN_DOCS_DIR` and `readOnly: true`.
  - [x] `bugTriageAgent` and the complexity agent both reference the workspace.
- [x] Edge cases:
  - [x] Empty/absent `docs/domain/` → agent gets empty listing, triage still completes.
  - [x] Complexity agent failure → logged, returns `FALLBACK_DIFFICULTY` (no throw).

#### 2.1.2 Integration Tests

- [x] Components / APIs involved: `bugTriageWorkflow` (evaluate → assessComplexity → createIssue) with tools mocked/stubbed.
- [x] Scenarios: complete report where the agent reads one bounded-context doc then produces difficulty + creates issue.

#### 2.1.3 End-to-End (E2E) / UI Tests

- [x] User flows: Slack bug report thread → clarifying question referencing the correct bounded context → Linear issue created with difficulty label. (Manual/local via `npm run dev:local`.)

#### 2.1.4 Non-Functional Tests

- [ ] Performance: assert `listDomainDocs` does not read full doc bodies; agent reads ≤2 docs per turn.
- [ ] Security: traversal-guard unit test above.
- [ ] Reliability / Regression: complexity step still returns `FALLBACK_DIFFICULTY` on agent failure.

---

## 3. Test Design

### 3.1 Test Scenarios

- [x] Test Scenario 1 — Minimal reading
  - GIVEN a manifest with 6 domain docs
  - WHEN the triage agent evaluates a document-editing bug
  - THEN it lists the index and reads only `document-management.md` (not all docs)

- [x] Test Scenario 2 — Read-only, scoped workspace
  - GIVEN the workspace `LocalFilesystem({ basePath: docs/domain, readOnly: true })`
  - WHEN the agent attempts a write or a path outside `docs/domain`
  - THEN Mastra blocks it (no write tools exposed / out-of-jail read denied)

- [x] Test Scenario 3 — Empty docs dir
  - GIVEN `docs/domain/` is empty or absent
  - WHEN the triage agent lists/searches
  - THEN it gets an empty result and triage still completes

- [x] Test Scenario 4 — Graceful degrade
  - GIVEN the complexity agent call fails
  - WHEN the complexity step runs
  - THEN it logs the failure and returns `FALLBACK_DIFFICULTY` (medium)

### 3.2 Test Data

- Fixture `docs/domain/` with 2–3 small `.md` files (temp dir used as `basePath`).
- Synthetic Slack thread messages targeting a known bounded context.
- No real credentials; Langfuse mocked to local fallback.

---

## 4. Environments & Tools

- Test environments: local.
- Builds / versions under test: current `feat/mastra-langfuse-triage` branch.
- Automation framework / tools: project test runner (`npm run test`), `agent-browser` for E2E if UI verification needed.
- Monitoring / logging tools: `logger` util output; Langfuse traces.

---

## 5. Entry & Exit Criteria

### 5.1 Entry Criteria

- [x] Implementation tasks 1–7 in IMPLEMENTATION.md complete and building.
- [x] Fixture domain docs available.

### 5.2 Exit Criteria

- [x] All unit tests pass; `npm run lint` clean.
- [ ] `archgate check` reports zero violations (warnings surfaced to user).
- [x] No open blocker defects in the traversal-guard or degrade paths.
- [ ] `@architect` and `@quality-manager` sign-off complete.
