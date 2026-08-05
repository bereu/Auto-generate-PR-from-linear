# Implementation Plan — Migrate Slack Triage from Mastra to Claude Agent SDK

## 1. Overview

### 1.1 Goals

- Replace **Mastra** (workflows, steps, `Agent`, `Workspace`, `RequestContext`,
  observability) with the **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`,
  already a dependency) as the engine for the Slack triage flow.
- Run the triage flow as a **single agentic `query()` session per thread turn**.
  A system prompt + tools let the agent classify intent, ask clarifying
  questions, and create Linear issues (chosen: _Fully agentic_).
- Give the agent **Linear MCP** tools so it creates issues through MCP
  (chosen: _MCP for actions_).
- **Slack I/O (webhook intake, thread history, posting, subscribe/unsubscribe)
  stays entirely on Chat SDK** (`chat` + `@chat-adapter/slack` +
  `@chat-adapter/state-*`) — this satisfies requirement 3 and cannot be replaced
  by MCP (MCP is outbound tool-calling; it cannot receive inbound Slack Events).
- **Add the official Slack MCP as a READ/SEARCH-ONLY augmentation** (chosen):
  the triage agent gets Slack MCP _search_ tools so it can look up related/
  duplicate discussions across the workspace before creating a Linear issue.
  **No Slack write/post tools are allowlisted** — posting remains on Chat SDK.
  See §1.4 for the auth/enablement constraints (user-OAuth, admin approval).
- Keep **Langfuse for prompt management** (fetch-with-local-fallback, required
  by ARCH-001); drop `@mastra/*` observability and rely on Claude Agent SDK
  logging/hooks for tracing (chosen: _Prompts yes, tracing via SDK_).
- Use the **official remote Linear MCP** (write: create issue) + **Slack MCP**
  (read/search only) via the SDK `mcpServers` option, with **strict
  tool-permission scoping** (§3.5).

### 1.2 Non-Goals

- The **Linear-webhook → Claude code-implementation** path (`src/agent.ts`)
  already uses the Claude Agent SDK. **Out of scope**, stays unchanged.
- No change to git-worktree isolation, `sync-repos`, or the fly.io deploy model.
- No redesign of the Linear domain model / value objects.
- Not using Slack MCP for posting/writing or as a webhook receiver — Slack MCP
  is added for read/search only; all Slack writes stay on Chat SDK (§1.4).

### 1.3 Architectural note (REQUIRED reading before coding)

This migration **contradicts two ADRs as written**; both are being updated
alongside this plan (see the ADR-update task):

- **ARCH-001** describes the triage loop as a _Mastra Workflow_ and names Mastra
  in its sequence diagram → updated to the Claude Agent SDK agentic triage with
  Slack on Chat SDK and Linear via Linear MCP.
- **BE-001** sanctions _Mastra Workflows as Coordinator-layer orchestration_ and
  requires steps to delegate side-effects to Command/Query → updated to sanction
  a "Claude Agent SDK agent" as an alternative Coordinator-layer orchestration
  primitive, defining where MCP-tool side-effects sit vs the Command/Transfer
  rule, and how deterministic guarantees (Linear label/state) are preserved.

Until the ADR edits land, `archgate check` may warn — surface warnings, never
silence them.

### 1.4 Slack: Chat SDK for I/O, Slack MCP for search only (decision record)

Slack's official MCP server (GA Feb 2026) is a _capability of a Slack app_
declared in the app manifest (`mcp:connect` scope) requiring admin approval;
auth is per-user OAuth / Slack-identity (private/DM search scopes require user
consent), and **every call runs as the authenticated Slack user, not a bot**.

Consequences for this design:

- **Chat SDK is mandatory and unchanged** for all Slack I/O: it is the inbound
  Slack Events webhook receiver + thread/subscription manager + poster (bot
  token). MCP cannot do any of this (it is outbound tool-calling only).
- **Slack MCP is added ONLY for read/search** — the agent can search the
  workspace for related/duplicate discussions before creating a Linear issue, a
  capability Chat SDK does not provide. It is wired with search/read tools
  **allowlisted** and **all write/post/channel-mutation tools denied** (§3.5).
- Enablement cost is accepted: Slack app manifest `mcp:connect` scope + admin
  approval + a provisioned user-OAuth token; calls run under that user's
  identity and permissions. See Risk R3.

(Sources: docs.slack.dev/ai/slack-mcp-server, the Feb 17 2026 Slack MCP
changelog + RTS API, Slack help guide, Slack MCP security blog.)

---

## 2. Requirements

### 2.1 Functional Requirements

- [ ] FR1: On a new Slack mention or a subscribed follow-up, the coordinator
      passes the thread's recent messages to a single Claude Agent SDK `query()`
      triage session.
- [ ] FR2: The agent classifies intent (question | bug | feature_request) and
      decides the turn's action: answer, ask ONE clarifying question, or create a
      Linear issue.
- [ ] FR3: Clarifying questions and answers are posted to the Slack thread via
      **Chat SDK** (`thread.post`). Either the coordinator posts the agent's
      returned message, or the agent calls a small in-process **custom
      Chat-SDK-backed tool** — decide in Task 4 (prefer coordinator-posts for
      deterministic 3s ack + subscription control).
- [ ] FR4: The agent creates the Linear issue via **Linear MCP**, applying the
      `agent` label (+ `feature` + difficulty labels) and `Todo` state so the
      downstream Linear webhook trigger still fires (Risk R1 + reconciliation).
- [ ] FR5: System prompt(s) are fetched from Langfuse with local-constant
      fallback (ARCH-001 rule preserved).
- [ ] FR6: Subscription lifecycle preserved (Chat SDK): stay subscribed while
      clarifying/answering; unsubscribe after issue creation or max rounds.
- [ ] FR7: Failures are classified (business vs system), reported via `logger`
      (BE-003), best-effort message posted in-thread; original error preserved.
- [ ] FR8: The agent's MCP access is **least-privilege**: only the exact Linear
      tools it needs (incl. create) and Slack **search/read** tools are
      allowlisted; all Slack write/post tools and destructive Linear tools are
      denied (§3.5).
- [ ] FR9: The agent MAY use Slack MCP **search** tools to find related/duplicate
      discussions before creating an issue; results inform the issue but never
      perform a Slack side-effect (posting stays on Chat SDK).
- [ ] FR10: All `@mastra/*` packages removed from `package.json`; no `@mastra/*`
      imports remain.

### 2.2 Non-Functional Requirements

- [ ] Performance: Slack Events API needs an HTTP ack < 3s; the `query()` run
      MUST NOT block the webhook HTTP response (keep the current async handler
      pattern in the coordinator).
- [ ] Security: Linear MCP token via env only; no secrets in source (ARCH-001).
      Chat SDK signature verification remains mandatory. Agent tool access is
      allowlisted + destructive-denied (§3.5).
- [ ] Reliability: Langfuse prompt-fetch outage degrades to local fallback, never
      hard-fails (BE-003). MCP-tool failure is caught and reported.
- [ ] Observability: preserve tool-use/result logging (mirror `agent.ts`) after
      `@mastra/observability` is removed.

---

## 3. Architecture & Design

### 3.1 High-Level Design

```
Slack ──(Events API webhook)──▶ Chat SDK (@chat-adapter/slack)      [Slack intake + history + POSTING]
                                      │ onNewMention / onSubscribedMessage
                                      ▼
                        SlackBotCoordinator (Coordinator layer)      [MODIFIED]
                          │ build prompt from thread.recentMessages
                          │ post agent replies via thread.post
                          │ subscribe / unsubscribe
                          ▼
                     TriageAgent  (Claude Agent SDK query())         [NEW]
                       ├─ systemPrompt ← Langfuse (local fallback)
                       ├─ mcpServers: { linear: <remote>, slack: <remote> }
                       ├─ allowedTools: minimal Linear tools + Slack SEARCH/READ tools
                       ├─ disallowedTools: Slack write/post + destructive Linear
                       └─ PreToolUse deny-hook (destructive)
                                      │
                       ┌──────────────┴───────────────┐
                       ▼                               ▼
              Linear MCP (create issue)        Slack MCP (search/read ONLY)
                       │                          related/duplicate discussions
                       ▼
              Reconciliation Command (LinearTransfer)  [R1 guard: enforce agent label + Todo]
```

Removed: Mastra `triageWorkflow` + nested intake/question workflows + all step
defs + the five Mastra `Agent`s + `domainDocsWorkspace`. Domain-doc access
(previously the Mastra `Workspace`) is provided via the SDK's read-only
filesystem tool scoped to `DOMAIN_DOCS_DIR`, or by inlining relevant docs into
the prompt (decide in Task 4).

### 3.2 Affected Components

- **Coordinator**: `slack-bot.coordinator.ts` — swap Mastra workflow run for a
  `TriageAgent` call; keep Chat SDK wiring, posting, subscription, `reportFailure`.
- **New agent module**: `src/slack-triage/agent/triage.agent.ts` — owns `query()`,
  options, Linear + Slack MCP config, prompt assembly, result/tool-use handling,
  the turn-action outcome the coordinator acts on.
- **New MCP config**: `src/slack-triage/agent/mcp-servers.ts` — Linear MCP server
  (create) + Slack MCP server (search/read only) + minimal `allowedTools` +
  `disallowedTools` (Slack writes + destructive Linear) + the PreToolUse deny-hook.
- **New R1 guard**: `src/slack-triage/command/reconcile-linear-issue.command.ts`
  (thin Command over `LinearTransfer`) — verify/enforce `agent` label + `Todo`
  state after the agent creates the issue. (Replaces the deleted
  `create-linear-issue.command` responsibility of guaranteeing labels/state.)
- **Constants**: retire `src/constants/mastra.constants.ts`; move survivors
  (`LANGFUSE_PROMPT_NAMES`, model ids) into `src/constants/agent.constants.ts`;
  add Linear + Slack MCP server-name / tool-name constants.
- **Util**: delete `src/util/mastra.ts`; `src/util/langfuse.ts` re-points its
  `LANGFUSE_PROMPT_NAMES` import; add `fetchTriageAgentPrompt()`.
- **Module**: `slack-triage.module.ts` — drop deleted providers; register
  `TriageAgent` + reconciliation Command.
- **Bootstrap**: `main.ts` (drop Mastra shutdown flush), `app.module.ts` (drop
  MastraModule note), `create-app.ts` (env validation adds `LINEAR_MCP_*` +
  `SLACK_MCP_*`), `.env.example`.
- **Docs/ADR**: ARCH-001, BE-001 updates; update/remove `docs/mastra-integration`
  reference in `app.module.ts`.

### 3.3 Data Model / API Changes

- No DB/RDB changes. No new/changed HTTP endpoints.
- New env vars (finalise in Task 1): `LINEAR_MCP_URL` (+ auth token, or reuse
  `LINEAR_API_KEY` if the chosen server accepts it — see R2); `SLACK_MCP_URL` +
  `SLACK_MCP_TOKEN` (provisioned user-OAuth token for the Slack MCP — see R3).
  Chat SDK Slack I/O keeps using `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET`.
- SDK `query()` shape (grounded in docs). Note Slack tool names are illustrative
  — confirm the real search/read tool names against the Slack MCP in Task 1:
  ```ts
  query({
    prompt,                                  // from thread.recentMessages
    options: {
      mcpServers: {
        linear: { type: "sse",  url: LINEAR_MCP_URL, headers: { Authorization: `Bearer ${...}` } },
        slack:  { type: "http", url: SLACK_MCP_URL,  headers: { Authorization: `Bearer ${SLACK_MCP_TOKEN}` } },
      },
      // allowlist: Linear create + minimal reads, Slack SEARCH/READ only
      allowedTools: [
        "mcp__linear__create_issue", "mcp__linear__list_issues",
        "mcp__slack__search_messages", "mcp__slack__read_thread",
      ],
      // denylist: destructive Linear + ALL Slack writes/posts
      disallowedTools: [
        "mcp__linear__delete_issue", "mcp__linear__archive_issue",
        "mcp__slack__post_message", "mcp__slack__send_message", "mcp__slack__create_channel",
      ],
      hooks: { PreToolUse: [
        { matcher: "mcp__linear__.*", hooks: [denyDestructiveLinear] },
        { matcher: "mcp__slack__.*",  hooks: [denySlackWrites] },   // belt-and-suspenders: block any non-read Slack tool
      ] },
      systemPrompt: await langfuse.fetchTriageAgentPrompt(),
      maxTurns: TRIAGE_MAX_TURNS,
    },
  })
  ```

### 3.4 Files to REMOVE

**Mastra engine / agents / workflows:**

- `src/util/mastra.ts`
- `src/slack-triage/agent/bug-triage.agent.ts`
- `src/slack-triage/agent/complexity.agent.ts`
- `src/slack-triage/agent/intent-classifier.agent.ts`
- `src/slack-triage/agent/question-answer.agent.ts`
- `src/slack-triage/agent/feature-intake.agent.ts`
- `src/slack-triage/agent/domain-docs.workspace.ts`
- `src/slack-triage/workflow/triage.workflow.ts`
- `src/slack-triage/workflow/intake.workflow.ts`
- `src/slack-triage/workflow/question.workflow.ts`
- `src/slack-triage/workflow/shared-steps.ts`

**CQRS layers subsumed by the agentic agent + Linear MCP (incl. co-located tests):**

- `src/slack-triage/query/classify-message.query.ts` (+ `.test.ts`)
- `src/slack-triage/query/answer-question.query.ts` (+ `.test.ts`)
- `src/slack-triage/query/evaluate-bug-report.query.ts` (+ `.test.ts`)
- `src/slack-triage/query/evaluate-feature-request.query.ts` (+ `.test.ts`)
- `src/slack-triage/command/create-linear-issue.command.ts` (+ `.test.ts`)
  — issue creation moves to Linear MCP; the label/state guarantee moves to the
  new reconciliation Command (§3.2, R1).

**Constants (delete after migrating survivors):**

- `src/constants/mastra.constants.ts` — keep `LANGFUSE_PROMPT_NAMES` + model ids
  (move them); delete `WORKFLOW_NAMES`, `WORKFLOW_STEP_IDS`, `AGENT_NAMES`,
  `OBSERVABILITY_SERVICE_NAME`.

**package.json dependencies:**

- `@mastra/core`, `@mastra/langfuse`, `@mastra/nestjs`, `@mastra/observability`.
- `@ai-sdk/anthropic` and `ai` — remove **only if** no source still imports them
  (verify with grep in Task 8; currently used by the deleted command + agents).

**Possibly stale (verify, then remove/update):**

- `docs/mastra-integration*` (referenced by `app.module.ts`).

### 3.5 Tool-permission scoping (answers "can we block delete?")

Layered, least-privilege — all supported by the SDK:

1. **`allowedTools` (allowlist, default-deny):** only the exact tools the flow
   needs — Linear create (+ minimal Linear reads) and Slack **search/read**
   tools. Anything unlisted is unavailable.
2. **`disallowedTools` (explicit denylist):** destructive Linear tools
   (delete/archive/cancel) **and every Slack write/post/channel-mutation tool**,
   so they can never run even if later allowlisted.
3. **`PreToolUse` deny-hooks (defense-in-depth):**
   - `mcp__linear__.*` → deny any tool whose name/args look destructive.
   - `mcp__slack__.*` → deny anything that is not an explicit read/search tool
     (whitelist-in-hook), so a newly added Slack write tool is blocked by default.
     Same mechanism used to block `rm -rf /`.
4. **`canUseTool`** available if we later want per-call programmatic checks.

**Slack MCP is read-only by construction here**: no Slack write tool is
allowlisted, all are denylisted, and the Slack PreToolUse hook fails closed.

Ship #1 + #2 + #3 together. Add unit tests asserting (a) the allowlist is
minimal, (b) a destructive Linear tool is denied, and (c) a Slack write tool is
denied by both the denylist and the hook.

### 3.6 Files to ADD

- `src/slack-triage/agent/triage.agent.ts`
- `src/slack-triage/agent/mcp-servers.ts` (Linear + Slack MCP config + tool guards)
- `src/slack-triage/command/reconcile-linear-issue.command.ts` (R1 guard)
- Tests: `triage.agent.test.ts`, `reconcile-linear-issue.command.test.ts`
- New `TRIAGE_AGENT_SYSTEM_PROMPT` in `slack-triage.constants.ts` +
  `fetchTriageAgentPrompt()` in `langfuse.ts` + `LANGFUSE_PROMPT_NAMES.triageAgent`.

### 3.7 Files to MODIFY

`slack-bot.coordinator.ts`, `slack-triage.module.ts`,
`slack-bot.coordinator.test.ts`, `slack-triage.constants.ts`, `util/langfuse.ts`,
`main.ts`, `app.module.ts`, `create-app.ts`, `.env.example`, `package.json`,
`docs/adr/ARCH-001-*.md`, `docs/adr/BE-001-*.md`.

---

## 4. Implementation Plan

### 4.1 Tasks & Milestones

- [x] Task 0 — **Update ADRs** ARCH-001 & BE-001 (done via `adr-author`;
      `archgate check` passes 10/10, incl. the updated `coordinator-must-orchestrate`
      rule) so implementation targets a compliant baseline.
- [x] Task 1 — **Resolve MCP wiring**: env vars (`LINEAR_MCP_URL`, `LINEAR_MCP_TOKEN`,
      optional `SLACK_MCP_URL`/`SLACK_MCP_TOKEN`); `.env.example` updated;
      `validateEnv` enforces Linear MCP vars (required) vs Slack MCP (optional,
      non-blocking). Added MCP tool name constants + model IDs in
      `agent.constants.ts` with TODO comments flagging unknowns (exact Linear/Slack
      MCP tool names, endpoints, and auth transport) for human input before deploy.
      Added `TRIAGE_AGENT_SYSTEM_PROMPT` constant + `fetchTriageAgentPrompt()` in
      `langfuse.ts` (local fallback, no Langfuse required).
- [x] Task 2 — **Add `mcp-servers.ts`**: Linear MCP (create + minimal reads) +
      Slack MCP (search/read only, optional, non-blocking) servers; `allowedTools`
      (minimal Linear + Slack search/read); `disallowedTools` (destructive Linear +
      all Slack writes); `denyDestructiveLinear` + `denySlackWrites` PreToolUse
      hooks (Slack hook fails closed, R3 mitigation).
- [x] Task 3 — **Consolidated triage system prompt**: TRIAGE_AGENT_SYSTEM_PROMPT
      constant in slack-triage.constants.ts. Agent classifies intent → clarify →
      create issue, MAY use Slack search for related discussions (optional),
      enforces linear label (delegated to reconciliation Command). Added
      `fetchTriageAgentPrompt()` in langfuse.ts with local fallback +
      `LANGFUSE_PROMPT_NAMES.triageAgent` in agent.constants.ts.
- [x] Task 4 — **TriageAgent**: assembled prompt from thread.recentMessages, run
      query() with Linear + Slack MCP scoping, iterate stream, log tool-use,
      detect result/error_max_turns, return typed TriageTurnOutcome (action +
      message + issueUrl/issueId). Coordinator posts via Chat SDK (never MCP).
- [x] Task 5 — **ReconcileLinearIssueCommand**: enforces agent label + Todo state
      post-creation via LinearTransfer.addLabel() + changeState() (R1 guard).
      Added fetchIssueById() + addLabel() methods to LinearTransfer.
- [x] Task 6 — **Rewrite SlackBotCoordinator**: calls TriageAgent.run(), posts
      replies via Chat SDK, manages subscribe/unsubscribe (Chat SDK), runs
      reconciliation Command post-creation. Keeps handleWebhook + reportFailure.
      Preserves non-blocking webhook ack (triage runs async per Slack 3s limit).
- [x] Task 7 — **Migrate constants**: moved LANGFUSE_PROMPT_NAMES, MCP server/tool
      names, TRIAGE_AGENT_MODEL, TRIAGE_MAX_TURNS to agent.constants.ts. Updated
      langfuse.ts imports (removed import from deprecated mastra.constants.ts).
      Deprecated mastra.constants.ts (stub only).
- [x] Task 8 — **Update module + bootstrap**: SlackTriageModule registers TriageAgent + ReconcileLinearIssueCommand, removes Mastra Query/Command providers. Removed
      Mastra observability.shutdown() from main.ts. create-app.ts validateEnv
      requires LINEAR*MCP*\* vars. .env.example updated.
- [x] Task 9 — **Delete Mastra files** (all agents, workflows, legacy Query/Command
      files from §3.4). Verified no remaining @mastra imports in src/_.ts. Pruned
      package.json: removed @mastra/_ + ai + @ai-sdk/anthropic (confirmed no remaining
      imports via grep). Legacy coordinator test deleted.
- [x] Task 10 — **Unit tests**: reconcile-linear-issue.command.test.ts (label/state
      enforcement). slack-bot.coordinator.test.ts covering all 7 TEST.md scenarios
      (bug→create, incomplete→clarify, question→answer, max-rounds, Langfuse
      outage, error handling, Slack MCP read/search only). All mock network/Anthropic
      calls per TEST.md §2.1.1. **TriageAgent.runQuerySession() now fully implemented**:
      real JSON extraction from assistant message, Linear issue ID extraction from
      tool results, graceful fallback on parse errors per BE-003. Response parsing
      handles all 4 action types: `answered_question`, `asked_clarifying_question`,
      `created_issue`, error/max-rounds.
- [x] Task 11 — **Validate**: `pnpm build` passing (dist/main.js), `pnpm test` 16
      passing (reconciliation + coordinator 9 scenarios), `pnpm archgate check`
      10/10 passing (no violations). Lint warnings (max-lines-per-function) partially
      addressed: refactored mcp-servers.ts into helper functions (setupMcpServers,
      buildAllowedTools, buildDisallowedTools, buildDenyHooks, logMcpConfiguration);
      coordinator refactored into action handlers (actOnTriageOutcome,
      handleAnsweredQuestion, handleClarifyingQuestion, handleCreatedIssue,
      handleTriageError). No ADR violations. `mastra.constants.ts` deleted
      completely; `app.module.ts` comment updated to reflect Claude Agent SDK design.
- [ ] Task 12 — **Capture**: `@architect` then `@quality-manager` to confirm the
      ADR updates fully reflect the shipped design.

## Implementation Notes / Assumptions

### MCP Endpoints & Tokens (Task 1 unknowns — HUMAN INPUT REQUIRED before deploy)

1. **Linear MCP**: Assumed remote HTTP server reachable via `LINEAR_MCP_URL` env var,
   authenticated with `LINEAR_MCP_TOKEN` bearer token. Actual endpoint, auth transport
   (stdio/HTTP), and official tool names TBD by Linear MCP provisioning team.
   - Placeholders: `LINEAR_MCP_TOOLS.{createIssue,listIssues,getIssue}`
     (`mcp__linear__*` namespace)
   - TODO: Confirm exact tool names and endpoint once Linear MCP is provisioned

2. **Slack MCP** (optional, read/search only, non-blocking per R3):
   - Assumed remote HTTP server via `SLACK_MCP_URL`, user-OAuth token (`SLACK_MCP_TOKEN`)
   - Requires admin approval for app manifest `mcp:connect` scope (gated by Slack)
   - Placeholders: `SLACK_MCP_TOOLS.{searchMessages,readThread,listChannels}`
   - TODO: Confirm Slack MCP availability, scope approval, and real tool names
   - If unprovisioned: agent proceeds without duplicate-search (graceful degradation, R3)

### TriageAgent System Prompt (Task 3 assumption)

- Consolidated into single prompt: intent → clarify → create flow
- Agent returns JSON with `action` + optional `message`/`title`/`description` fields
- Coordinator parses this JSON to decide post/unsubscribe actions
- **Actual implementation** of JSON parsing in TriageAgent is stubbed (returns
  `created_issue` for testing); real implementation needs to extract agent's final
  turn message and parse it as JSON per the prompt spec

### TriageAgent response parsing (Task 4 COMPLETED)

- **IMPLEMENTED**: `runQuerySession()` now extracts and parses agent's actual response
- Real implementation:
  1. ✓ Captures final assistant message text from query stream
  2. ✓ Extracts JSON from response (defensive: agent may include surrounding text)
  3. ✓ Parses JSON to extract action + message/title/description/difficulty
  4. ✓ Extracts Linear issue ID from MCP tool results in stream
  5. ✓ Returns typed `TriageTurnOutcome` with real action/message/issueId/issueUrl
  6. ✓ Graceful error handling: parse failure → log error + return safe error outcome (BE-003)
- Supports all 4 action types: `answered_question`, `asked_clarifying_question`,
  `created_issue`, error/max-rounds
- Issue URL construction: if issueId available, builds Linear URL; else passes issueId
  to coordinator for reconciliation Command to resolve

### Coordinator async triage (Task 6 decision)

- Slack webhook handler subscribes the thread, then returns immediately (non-blocking)
- Triage runs asynchronously via `.catch()` handler on the promise
- This satisfies the 3-second Slack Events API ack requirement
- Trade-off: user sees subscription confirmation immediately, triage reply moments later

### Tool-scoping defense-in-depth (Task 2 verification)

- Three layers enforce tool access:
  1. `allowedTools` allowlist (whitelist only needed tools)
  2. `disallowedTools` denylist (belt-and-suspenders for destructive tools)
  3. `PreToolUse` deny-hooks (Slack hook fails closed: only whitelisted tools pass)
- Test coverage for tool-scoping in coordinator tests required (replacing deleted agent tests)

### Reconciliation Command (Task 5 simplified)

- Simplified execution: fetch issue → check label/state → add label if missing →
  change state if not Todo
- Replaces the old CreateLinearIssueCommand (which was CQRS-layer issue creation)
- Works with LinearTransfer.addLabel() and changeState() (existing methods extended)
- R1 invariant enforcement: if agent fails to set label/state, this Command fixes it

### Constants migration (Task 7 note)

- `LANGFUSE_PROMPT_NAMES` moved to `agent.constants.ts` (replaces mastra.constants.ts)
- MCP tool names and server names centralized in same file with TODO comments
- Original `mastra.constants.ts` deprecated (stub kept for backward compat; no imports remain)
- All surviving constants follow GEN-001 (no magic strings in business logic)

### 4.2 Rollout Strategy

- Branch `use-claude-agent-sdk-version` (created).
- Order: local (`pnpm dev:local` + localtunnel per GEN-003) → verify Slack
  round-trip + Linear issue with correct label/state + downstream webhook →
  `fly secrets set` Linear MCP vars → `pnpm deploy`.
- No data migration (triage stateless per turn; Chat SDK owns history).

### 4.3 Risks & Mitigations

- **R1 — Deterministic Linear label/state (HIGH).** Downstream webhook fires only
  on label `agent` + state `Todo`. _Mitigation:_ prompt mandates them **and** the
  reconciliation Command (Task 5) verifies/enforces post-creation; if MCP can't
  set labels, keep creation in a Command and give the agent read-only Linear tools.
- **R2 — Linear remote MCP uses OAuth (HIGH for headless).** _Mitigation:_
  pre-provisioned token in `headers`, or a stdio Linear MCP accepting
  `LINEAR_API_KEY`. Resolve in Task 1.
- **R3 — Slack MCP is user-OAuth / admin-gated (MEDIUM).** The official Slack MCP
  needs an app-manifest `mcp:connect` scope, admin approval, and a user-OAuth
  token; it runs under a _user_ identity (§1.4). _Mitigation:_ scope it to
  **read/search only** (never posting — posting stays on Chat SDK), so a token
  lapse degrades gracefully (agent skips the duplicate-check search) rather than
  breaking triage. Provision the token/consent in Task 1. If enablement is
  blocked, ship without Slack MCP first (agent still creates issues; only the
  workspace duplicate-search is deferred) — it is a non-blocking augmentation.
  **Chat SDK remains the sole Slack I/O path regardless.**
- **R4 — 3s Slack ack.** Keep the non-blocking handler; `query()` runs async.
- **R5 — ADR transition.** ADRs updated in Task 0; surface any residual warnings.
- **R6 — Observability loss.** Replicate tool-use/result logging (as `agent.ts`);
  optionally wrap `query()` in Langfuse JS SDK spans.

---

## 5. Monitoring & Operations

- Logs: `logger` util — intent decision, each Linear MCP tool-use (truncated,
  like `agent.ts`), `result` subtype/usage, reconciliation outcome, classified
  failures.
- Alerts: Rollbar via `logger` (BE-003): system → `error`, business → `warn`.
- Runbook: rotate Linear MCP token; R1 canary (confirm issues land with `agent` +
  `Todo` and the downstream webhook fires); `fly secrets` list for MCP vars.
- Env validation fails fast on missing required Linear MCP vars.
