# Test Plan — Triage Agent: MCP → CLI-backed Skills

## 1. Overview

### 1.1 Test Objectives

- Verify the triage agent is configured with skills + Bash (no `mcpServers`).
- Verify destructive/write CLI commands are rejected fail-closed by the deny-hook.
- Verify the created Linear issue `issueId` is captured from the agent's final JSON and flows to reconciliation.
- Verify graceful degradation when Slack CLI auth is absent.

### 1.2 Test Scope

- In scope: `mcp-servers.ts` (renamed builder + deny-hook), `triage.agent.ts` (query options + `issueId` parsing), coordinator wiring.
- Out of scope: live CLI network calls to Slack/Linear; Dockerfile/Fly deploy (follow-up); Langfuse-hosted prompt content.

---

## 2. Test Strategy

### 2.1 Test Levels

#### 2.1.1 Unit Tests (per BE-004)

- Target modules: `src/slack-triage/agent/mcp-servers.ts`, `src/slack-triage/agent/triage.agent.ts`.
- Key cases:
  - Config builder returns `settingSources` incl. `project`, `skills` incl. `use-linear`/`use-slack`, `Bash` in `allowedTools`, and a `PreToolUse` hook; returns NO `mcpServers` key.
  - Deny-hook throws on each destructive/write pattern; passes read/create patterns.
  - `parseAgentResponse`/`buildCreateIssueOutcome` reads `issueId` from JSON.
- Edge cases:
  - `create_issue` JSON without `issueId` → outcome still `created_issue`, `issueId` undefined, warning logged.
  - Command with extra flags/quoting/`&&` chaining still matched by deny patterns.

#### 2.1.2 Integration Tests

- [ ] Components: `SlackBotCoordinator` + `TriageAgent` (mocked `query`) + `ReconcileLinearIssueCommand`.
- [ ] Scenarios: `created_issue` with `issueId` → reconciliation invoked with that ID; without `issueId` → reconciliation skipped, no crash.

#### 2.1.3 End-to-End / Manual

- [ ] With CLIs authed locally: post a complete bug report in a Slack thread → agent searches (optional), creates Linear issue, posts confirmation, reconciliation sets `agent`+`Todo`.
- [ ] Ask a question → `answered_question`, no issue created, no CLI write.

#### 2.1.4 Non-Functional

- [ ] Security: attempt a prompt that would delete an issue → deny-hook blocks; assert thrown error + log.
- [ ] Regression: existing coordinator tests pass after MCP references removed.

---

## 3. Test Design

### 3.1 Test Scenarios

- [ ] TS1 — Config shape
  - GIVEN the agent tools config builder
  - WHEN `buildAgentToolsConfig()` is called
  - THEN result has `skills` = ["use-slack","use-linear"], `Bash` in `allowedTools`, a `PreToolUse` hook, and no `mcpServers`.

- [ ] TS2 — Deny destructive Linear
  - GIVEN the Bash deny-hook
  - WHEN command is `linear issue delete ENG-1` (or archive/cancel/state update)
  - THEN it throws (fail closed).

- [ ] TS3 — Deny Slack writes
  - GIVEN the Bash deny-hook
  - WHEN command is `slack-cli send -c x -m y` (or edit/delete/upload)
  - THEN it throws.

- [ ] TS4 — Allow reads/create
  - GIVEN the Bash deny-hook
  - WHEN command is `linear issue create --json ...`, `linear issue query ...`, `slack-cli search ...`, `slack-cli history ...`
  - THEN it does NOT throw.

- [ ] TS5 — issueId capture
  - GIVEN an assistant final message with `{"action":"create_issue","issueId":"ENG-42",...}`
  - WHEN the stream is parsed
  - THEN outcome = `created_issue`, `issueId` = "ENG-42", `issueUrl` set.

- [ ] TS6 — Missing issueId
  - GIVEN `create_issue` JSON without `issueId`
  - WHEN parsed
  - THEN outcome = `created_issue`, `issueId` undefined, warning logged; coordinator skips reconciliation gracefully.

### 3.2 Test Data

- Synthetic assistant stream messages (fixtures) mimicking Claude Agent SDK output.
- Mock `query` async iterator; mock `logger`; no real CLI/network.

---

## 4. Environments & Tools

- Test env: local; `npm run test` (existing framework, e.g. vitest/jest as configured).
- Under test: branch `use-claude-agent-sdk-version`.
- Automation: unit + integration via existing test runner; manual E2E per §2.1.3 once CLIs authed.

---

## 5. Entry & Exit Criteria

### 5.1 Entry Criteria

- Code changes T1–T6 implemented; CLIs installed; skills present under `.claude/skills/`.

### 5.2 Exit Criteria

- `npm run lint` and `npm run test` pass; `archgate check` zero violations.
- No `mcpServers`/`mcp__` references remain in triage agent code (grep clean).
- `@architect` confirms ADR compliance (ARCH-001 amended); `@quality-manager` capture done.
