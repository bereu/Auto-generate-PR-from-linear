# Test Plan — Migrate Slack Triage from Mastra to Claude Agent SDK

## 1. Overview

### 1.1 Test Objectives

- Prove the Claude Agent SDK triage agent reproduces the behaviour previously
  delivered by the Mastra workflows: classify → clarify → create for bugs and
  feature requests, and answer for questions.
- Prove Linear issue creation goes through Linear MCP and created issues carry
  the `agent` label + `Todo` state (enforced by the reconciliation Command) so
  the downstream webhook still fires (Risk R1).
- Prove all Slack posting/subscription goes through Chat SDK (never MCP), and the
  Slack MCP is **read/search only** — no Slack write tool is reachable.
- Prove subscription lifecycle, failure handling (BE-003), and Langfuse
  prompt-fallback all still hold.
- Prove all `@mastra/*` code and deps are gone and the build/lint/tests pass.

### 1.2 Test Scope

- In scope: `TriageAgent`, `mcp-servers` config, rewritten `SlackBotCoordinator`,
  Langfuse `fetchTriageAgentPrompt` fallback, env validation, package cleanup.
- Out of scope (unchanged): `src/agent.ts` (Linear-webhook code path),
  `sync-repos`, git-worktree logic, Linear domain/value objects, `LinearTransfer`
  read methods (except any new label/state reconciliation added under R1).

---

## 2. Test Strategy

### 2.1 Test Levels

#### 2.1.1 Unit Tests

- Target modules:
  - `src/slack-triage/agent/triage.agent.ts` — **mock `query()`** from
    `@anthropic-ai/claude-agent-sdk` (async generator yielding assistant/tool_use
    and `result` messages). No real network / no real Anthropic calls.
  - `src/slack-triage/agent/mcp-servers.ts` — config assembly from env.
  - `src/slack-triage/coordinator/slack-bot.coordinator.ts` — mock `TriageAgent`
    - a fake Chat SDK `Thread`.
  - `src/util/langfuse.ts` — `fetchTriageAgentPrompt()` fallback path.
- Key cases:
  - Agent stream yielding a terminal `result` (success) resolves to a success
    outcome; token usage logged.
  - `result.subtype === "error_max_turns"` → max-rounds outcome (unsubscribe +
    best-effort message), mirroring old behaviour.
  - Tool-use blocks are logged (truncated) without throwing.
  - MCP config: `allowedTools` includes only the minimal Linear tools + Slack
    search/read tools; **no Slack write/post tool is allowlisted**; destructive
    Linear tools and Slack writes are in `disallowedTools`; the `denySlackWrites`
    PreToolUse hook denies a non-read Slack tool (fail closed); the
    `denyDestructiveLinear` hook denies a delete/archive call.
  - Slack MCP server is omitted gracefully when its env is unset (agent still
    runs; duplicate-search skipped) — per the R3 non-blocking mitigation.
- Edge cases (carried over from the deleted tests — preserve intent):
  - EC1: intent-classify failure falls back safely (agent still produces a
    sensible default; no unhandled throw).
  - EC2: answer/clarify generation failure posts a graceful message and stays
    subscribed.
  - Langfuse unreachable → local `TRIAGE_AGENT_SYSTEM_PROMPT` used; run not blocked.

#### 2.1.2 Integration Tests

- [ ] Components/APIs involved: Coordinator + TriageAgent + mocked MCP tool
      results + fake Thread (Chat SDK).
- [ ] Scenarios:
  - Bug thread, complete report → agent creates Linear issue via (mocked) Linear
    MCP; the reconciliation Command enforces label `agent` + state `Todo`
    (+ difficulty label); thread receives issue URL **via Chat SDK
    `thread.post`**; thread unsubscribed via Chat SDK.
  - Bug thread, incomplete → agent produces ONE clarifying question; the
    coordinator posts it **via Chat SDK `thread.post`** (never MCP); thread stays
    subscribed.
  - Duplicate check → agent calls the (mocked) Slack MCP **search** tool, finds a
    related discussion, and reflects it in the issue; assert no Slack write tool
    is invoked.
  - Slack write attempt denied → if the agent attempts a Slack write/post MCP
    tool, it is denied (denylist + hook) and the run still completes.
  - Feature request → feature issue created with `agent` + `feature` labels.
  - Question → answer posted in-thread via Chat SDK; stays subscribed; no Linear
    issue.
  - Max clarification rounds reached → best-effort issue or fallback message +
    unsubscribe (match prior `MAX_CLARIFICATION_ROUNDS` semantics).
  - Failure path → `reportFailure` classifies business vs system, logs at correct
    level (BE-003), posts in-thread; post failure does not mask original error.

#### 2.1.3 End-to-End (E2E) Tests

- [ ] User flows (run locally via `pnpm dev:local` + localtunnel, GEN-003):
  - Real Slack mention with a full bug report → real Linear issue appears with
    label `agent` + state `Todo` → confirm the **Linear webhook fires** and the
    code-implementation path (`agent.ts`) picks it up (the R1 canary — this is
    the critical cross-feature regression check).
  - Real Slack mention with a vague report → bot asks a clarifying question in
    thread; answering it results in issue creation.
  - Ask a product question → bot answers in-thread, no issue.
  - Duplicate report → post a bug resembling an existing one; confirm the agent
    used Slack search (visible in tool-use logs) and referenced the prior
    discussion. (Requires the Slack MCP token/consent from Task 1; if unavailable,
    mark N/A and confirm triage still works without it — R3 non-blocking.)

#### 2.1.4 Non-Functional Tests

- [ ] Performance: Slack event handler acks < 3s while `query()` runs async
      (observe no Slack retry/duplicate delivery).
- [ ] Security: no secrets in source (grep); MCP tokens read from env only;
      `allowedTools` is the minimal set and contains **no Slack write tool**
      (assert in unit test); Slack write + destructive Linear tools are denied.
- [ ] Reliability/Regression:
  - `grep -r "@mastra" src/` returns nothing.
  - `pnpm lint` passes: `vp check --fix && vp lint && pnpm archgate check &&
vp build && jscpd`. ADRs (ARCH-001/BE-001) are already updated for this design
    and `archgate check` currently passes 10/10; record and surface any new
    warnings introduced by the implementation.
  - `pnpm test` green; deleted-test coverage is replaced, not just dropped.

---

## 3. Test Design

### 3.1 Test Scenarios

- [ ] Scenario 1 — Complete bug → issue created with correct label/state
  - GIVEN a subscribed bug thread whose messages form a complete report
  - WHEN `TriageAgent` runs and the (mocked) Linear MCP create tool is invoked
  - THEN the reconciliation Command enforces label `agent` + state `Todo`
    (+ difficulty), the issue URL is posted to the thread **via Chat SDK**, and
    the thread is unsubscribed via Chat SDK

- [ ] Scenario 2 — Incomplete bug → single clarifying question
  - GIVEN a subscribed bug thread missing repro steps
  - WHEN `TriageAgent` runs
  - THEN exactly one clarifying question is posted **via Chat SDK `thread.post`**
    (no Slack write MCP tool called) and the thread stays subscribed (no Linear
    issue created)

- [ ] Scenario 3 — Question intent → answered, no issue
  - GIVEN a subscribed thread asking how a feature works
  - WHEN `TriageAgent` runs
  - THEN an answer is posted in-thread, the thread stays subscribed, and no
    Linear MCP create tool is called

- [ ] Scenario 4 — Max rounds reached
  - GIVEN a bug thread that has hit `MAX_CLARIFICATION_ROUNDS` bot turns
  - WHEN `TriageAgent` runs
  - THEN the max-rounds behaviour fires (best-effort issue or fallback message)
    and the thread is unsubscribed

- [ ] Scenario 5 — Langfuse outage
  - GIVEN Langfuse is unreachable
  - WHEN the system prompt is fetched
  - THEN the local `TRIAGE_AGENT_SYSTEM_PROMPT` fallback is used and the run
    proceeds

- [ ] Scenario 6 — Agent/MCP failure
  - GIVEN the `query()` stream errors or an MCP tool fails
  - WHEN the coordinator handles it
  - THEN the error is classified (business→warn / system→error) per BE-003, a
    best-effort message is posted in-thread, and the original error is preserved

- [ ] Scenario 7 — Slack MCP is read/search only
  - GIVEN the triage agent with Slack + Linear MCP configured
  - WHEN it processes a bug that resembles an existing report
  - THEN it may call the Slack **search** tool (allowed) to find the prior
    discussion, but any Slack write/post tool is denied by both `disallowedTools`
    and the `denySlackWrites` hook, and all thread posting still occurs via Chat SDK

### 3.2 Test Data

- Fixtures: fake Chat SDK `Thread` with `recentMessages`, `post`, `subscribe`,
  `unsubscribe`, `refresh` (reuse `src/test/message-helper.ts`).
- Mocked `query()` async generator returning scripted assistant/tool_use/result
  messages for each scenario.
- Synthetic bug/feature/question transcripts (no real user data).
- No real Slack/Linear/Anthropic calls in unit/integration; real tokens only in
  the local E2E run.

---

## 4. Environments & Tools

- Test env: local (`pnpm dev:local` + localtunnel per GEN-003) for E2E; CI-style
  local run for unit/integration.
- Builds under test: branch `use-claude-agent-sdk-version`.
- Framework: Vitest (`@voidzero-dev/vite-plus-test`), `pnpm test`.
- Lint/build gate: `pnpm lint` (oxlint + `archgate check` + `vp build` + jscpd).
- Monitoring: `logger` output; Rollbar (if `ROLLBAR_ACCESS_TOKEN` set); Langfuse
  (if kept for tracing).

---

## 5. Entry & Exit Criteria

### 5.1 Entry Criteria

- MCP wiring decisions from IMPLEMENTATION.md Task 1 resolved (R2/R3 answered).
- `TriageAgent`, coordinator rewrite, and constant migration implemented.
- MCP env vars set locally for E2E.

### 5.2 Exit Criteria

- All unit + integration scenarios (1–7) pass; deleted-test intent is preserved.
- E2E R1 canary passes: a Slack-originated Linear issue triggers the downstream
  webhook / `agent.ts` path.
- `grep -r "@mastra" src/` empty; `package.json` has no `@mastra/*`.
- `pnpm lint` and `pnpm test` green.
- `archgate check` passes (ARCH-001 & BE-001 already updated for this design;
  currently 10/10); any new warnings the implementation introduces are documented
  and routed to the `@quality-manager` / `@architect` capture phase; no unresolved
  ADR **violations**.
- No critical/blocker defects open.
