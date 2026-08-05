# Implementation Plan — Triage Agent: MCP → CLI-backed Skills

## 1. Overview

### 1.1 Goals

- Remove Linear MCP and Slack MCP from the triage agent.
- Drive Linear (create + minimal reads) and Slack (read/search only) through the
  `use-linear` and `use-slack` skills, which wrap the `linear` (schpet) and
  `slack-cli` (@urugus) CLIs, invoked via the `Bash` tool inside the Claude Agent
  SDK `query()` session.
- Preserve all existing behavioural guarantees: one action per turn, deterministic
  `agent` label + `Todo` state via the reconciliation Command, and Slack posting
  exclusively via Chat SDK.

### 1.2 Non-Goals

- No change to the Chat SDK inbound/outbound Slack integration (posting stays on Chat SDK).
- No change to the downstream Linear-webhook → Claude implementation → GitHub PR flow.
- **Production deploy changes (Dockerfile CLI install + Fly secrets) are documented as a
  follow-up in §4.2 but NOT applied in this change** (per decision 3).
- No OAuth/token-refresh layer (the whole point is to avoid OAuth).

---

## 2. Requirements

### 2.1 Functional Requirements

- [x] FR1: Triage agent creates Linear issues via `linear issue create --json` (through the `use-linear` skill), not Linear MCP.
- [x] FR2: Triage agent may search the workspace for duplicates via `slack-cli search`/`history` (through `use-slack`), not Slack MCP. Non-blocking if Slack auth is absent.
- [x] FR3: The created issue identifier is returned in the agent's final JSON (`issueId` field) and consumed by `ReconcileLinearIssueCommand`.
- [x] FR4: The agent is forbidden (fail-closed) from running destructive/write commands: `linear issue delete|archive|cancel`, `linear ... update ... state`, and any Slack write (`slack-cli send|edit|delete|upload|reaction|pin ...`).
- [x] FR5: `query()` loads the two skills via `cwd` + `settingSources:["user","project"]` + `skills:["use-slack","use-linear"]`, with `Bash` in `allowedTools`.

### 2.2 Non-Functional Requirements

- [x] Security: least-privilege enforced via `allowedTools` + a `PreToolUse` Bash-command deny-hook (fail closed). Documented trade-off: Bash is broader than scoped MCP tools (see §4.3 R1).
- [x] Reliability: absence of Slack auth degrades gracefully (duplicate-search skipped), matching current behaviour.
- [x] Error handling: all logging/reporting via the `logger` util (BE-003). No new Rollbar client.
- [x] Layering: changes respect BE-001 (agent orchestration stays in Coordinator layer).

---

## 3. Architecture & Design

### 3.1 High-Level Design

Replace the MCP transport with skill-driven CLI calls. The triage `query()` session
gains filesystem skill discovery and the `Bash` tool instead of `mcpServers`. Tool
scoping moves from MCP tool allow/deny names to (a) a tight `allowedTools` list and
(b) a `PreToolUse` hook that pattern-matches the Bash command string and throws on
any destructive/write command.

ARCH-001 is amended to document this CLI+skills architecture (it currently mandates MCP).

### 3.2 Affected Components

- **Module:** `src/slack-triage/agent/*`
  - `mcp-servers.ts` → rewrite (rename its exported builder; drop `mcpServers`).
  - `triage.agent.ts` → query options + issue-ID capture.
- **Constants:** `src/constants/agent.constants.ts` (MCP tool constants → CLI patterns).
- **Prompt:** `src/slack-triage/slack-triage.constants.ts` `TRIAGE_AGENT_SYSTEM_PROMPT`
  (local fallback for Langfuse `triage-agent-system`) → rewrite for skills/CLI + `issueId`.
- **Config:** `.env`, `.env.example`.
- **ADR:** `docs/adr/ARCH-001-production-architecture.md` (amend).
- **External integrations:** Linear via `linear` CLI (`LINEAR_API_KEY`); Slack read/search via `slack-cli`.

### 3.3 Data Model / API Changes

- `AgentResponse` interface (triage.agent.ts): add optional `issueId?: string`.
- `TriageTurnOutcome`: unchanged (already has `issueId`).
- Agent JSON contract (`create_issue`): add `"issueId": "<TEAM-123>"` produced by the agent
  after `linear issue create --json`.
- New `mcp-servers.ts` return shape:
  `{ settingSources: string[]; skills: string[]; allowedTools: string[]; disallowedTools: string[]; hooks }`.

---

## 4. Implementation Plan

### 4.1 Tasks & Milestones

- [x] T1: Amend `ARCH-001` — document CLI+skills triage architecture, mark MCP approach superseded (use `archgate:adr-author`).
- [x] T2: Rewrite `agent.constants.ts` — replace `MCP_SERVER_NAMES`, `LINEAR_MCP_TOOLS`, `SLACK_MCP_TOOLS`, `DESTRUCTIVE_LINEAR_TOOLS`, `SLACK_WRITE_TOOLS` with: allowed CLI command prefixes and a `DENIED_CLI_PATTERNS` regex list.
- [x] T3: Rewrite `mcp-servers.ts` → `buildAgentToolsConfig()`:
  - Return `settingSources`, `skills`, `allowedTools` (`["Bash","Skill","Read"]` or scoped `Bash(linear:*)`/`Bash(slack-cli:*)` if supported), `disallowedTools`, and a `PreToolUse` hook matching `Bash` that parses the command and throws on any `DENIED_CLI_PATTERNS` match (fail closed). Keep the graceful "no Slack auth" log.
- [x] T4: Update `triage.agent.ts`:
  - `buildQueryOptions`: drop `mcpServers`; add `cwd` (repo root), `settingSources`, `skills`; keep `allowedTools`/`disallowedTools`/`hooks`.
  - Add `issueId?` to `AgentResponse`; read it in `buildCreateIssueOutcome`.
  - Remove/retire MCP `tool_result` parsing (`extractIssueId`/`extractIdFromContent`) — issue ID now comes from agent JSON.
- [x] T5: Rewrite `TRIAGE_AGENT_SYSTEM_PROMPT` — instruct use of `use-linear`/`use-slack` skills (CLI), read-before-create, `linear issue create --json`, return `issueId` in JSON; keep "never post to Slack (Chat SDK does that)" and reconciliation notes. Update the Langfuse-hosted `triage-agent-system` prompt to match (documented; Langfuse edit is manual/out-of-band).
- [x] T6: Update `.env.example` (remove `SLACK_MCP_URL/TOKEN`, `LINEAR_MCP_URL/TOKEN`; add `LINEAR_API_KEY`, `SLACK_CLI_MASTER_KEY`, note `slack-cli` auth). Mirror in `.env` guidance.
- [x] T7: Tests (see TEST.md): new `mcp-servers` (renamed) unit tests for deny-hook command parsing; `triage.agent` tests for `issueId` JSON capture; update `slack-bot.coordinator.test.ts` MCP references.
- [x] T8: Validate — `npm run test`, `npx tsc --noEmit`, `archgate check`; then `@architect`, then `@quality-manager`. (Note: `npm run lint`/oxlint OOM'd in this environment; `tsc --noEmit` used as the type gate and is now a required check per BE-004.)

### 4.2 Rollout Strategy (deploy follow-up — NOT in this change)

- Dockerfile: `npm i -g @urugus/slack-cli` and install `linear` (deno/binary) in the image.
- Startup/bootstrap: `printf '%s\n' "$SLACK_API_TOKEN" | slack-cli config set --token-stdin` using Fly secret; `LINEAR_API_KEY` provided as a Fly secret (read directly by the CLI).
- Fly secrets to add: `LINEAR_API_KEY`, `SLACK_API_TOKEN` (xoxp user token), `SLACK_CLI_MASTER_KEY`.
- Remove obsolete secrets: `SLACK_MCP_*`, `LINEAR_MCP_*`.
- Verify order: dev (local CLIs authed) → confirm triage E2E → prod.

### 4.3 Risks & Mitigations

- **R1 — Bash is broader than MCP tool-scoping.** Impact: agent could in principle run unintended shell commands. Mitigation: minimal `allowedTools`; fail-closed `PreToolUse` deny-hook on command patterns; consider `Bash(linear:*)`/`Bash(slack-cli:*)` scoping. Documented & accepted.
- **R2 — Issue ID now model-reported (less deterministic than MCP tool_result).** Impact: reconciliation could miss an issue if the model omits `issueId`. Mitigation: explicit prompt contract + `--json` output; log a warning when `create_issue` returns no `issueId`; reconciliation already tolerates missing ID (skips).
- **R3 — Skills not discovered in `query()`.** Impact: agent has no Linear/Slack capability. Mitigation: assert `cwd` = repo root and `settingSources` includes `project`; add a test/log that skills are enabled.
- **R4 — Prompt drift between Langfuse and local fallback.** Mitigation: update both; local fallback is the source of truth in this repo.

---

## 5. Monitoring & Operations

- Watch `[triage-agent]` logs: tool/command use (already logged, truncated 200 chars), `issueId` capture, "Slack CLI not configured" warning.
- Alert path unchanged (Rollbar via `logger` per BE-003).
- Runbook note: if duplicate-search stops working, check `slack-cli config current` on the host; if issue creation fails, check `LINEAR_API_KEY` and `linear auth list`.
