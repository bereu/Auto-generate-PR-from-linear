# Implementation Plan — Mastra Agent Integration (Slack Triage)

## 1. Overview

Introduce [Mastra](https://mastra.ai) as the agent-orchestration framework, integrated with the
existing NestJS app and the **Chat SDK** that already manages Slack webhooks/threads. The first
integration target is the **Slack bug-triage clarification loop**: replace the ad-hoc
`generateObject` call in `EvaluateBugReportQuery` with a **Mastra agent**, keeping the Chat SDK as
the Slack transport and staying compliant with `BE-001` (layered architecture) and `GEN-002`
(folder structure).

Additionally, adopt **[Langfuse](https://langfuse.com) for prompt management**: the Mastra agent's
system prompt (`instructions`) is fetched from Langfuse (versioned, editable without redeploy)
instead of the hardcoded `TRIAGE_SYSTEM_PROMPT` constant, and the fetched prompt version is linked
into Mastra's traces for observability. This consolidates today's fragmented prompt handling
(`promptLoader` local `.md` files, `langsmith.ts` LangSmith Hub pull, and hardcoded constants) onto
one platform.

### 1.1 Goals

- Add Mastra to the project (`@mastra/core`, `@mastra/nestjs`) and register it in `AppModule`.
- Replace the `generateObject`-based triage in `EvaluateBugReportQuery` with a Mastra agent that
  manages the bug-report evaluation / clarifying-question decision.
- Keep the **Chat SDK** (`chat` + `@chat-adapter/slack`) as the Slack webhook & thread transport,
  unchanged, inside `SlackTransfer`.
- Use **in-memory** storage/memory for Mastra (consistent with the existing `createMemoryState()`),
  no durable persistence.
- Fold all Mastra artifacts into the existing layered architecture — **no idiomatic `src/mastra/`
  domain directory**.
- Add **Langfuse prompt management**: fetch the triage agent's system prompt from Langfuse
  (versioned), compile variables, and link the prompt version to the Mastra/AI-SDK trace.
- Provide a graceful fallback to a local default prompt when Langfuse is unreachable, so triage
  never hard-fails on a prompt-fetch outage.

### 1.2 Non‑Goals

- **Not** replacing the code-implementation agent (`@anthropic-ai/claude-agent-sdk` `query()` in
  `agent.ts` / `linear-webhook`). The Claude Agent SDK worktree pipeline (`ARCH-001`) stays as-is.
- **No** durable/Postgres/LibSQL storage for Mastra in this phase (in-memory only).
- **No** Mastra playground / dev-server / deploy tooling.
- **No** change to Slack Events API contract, webhook signature verification, or `ARCH-001` state
  machine transitions.
- **Not** ripping out the existing `langsmith.ts` / `promptLoader` in this phase — Langfuse is
  introduced for the triage prompt first; broader migration of the `agent.ts` `task` prompt to
  Langfuse is a follow-up (noted, not implemented here).
- **No** self-hosted Langfuse deployment — assumes a Langfuse Cloud project or an existing instance
  reachable via env vars.

---

## 2. Requirements

### 2.1 Functional Requirements

- [ ] FR1: Add `@mastra/core` and `@mastra/nestjs` dependencies (versions pinned & verified).
- [ ] FR2: A single Mastra instance is created as a **util singleton** (`src/util/mastra.ts`) with
      in-memory memory and the Pino logger already used in the project.
- [ ] FR3: `MastraModule.register({ mastra })` is imported in `AppModule`.
- [ ] FR4: A bug-triage Mastra agent is defined (system prompt sourced from
      `TRIAGE_SYSTEM_PROMPT`, model `claude-haiku-4-5`, structured output
      `{ isComplete, clarifyingQuestion }`).
- [ ] FR5: `EvaluateBugReportQuery.execute()` invokes the Mastra agent instead of `generateObject`,
      returning the identical `{ isComplete: boolean; clarifyingQuestion: string | null }` shape so
      `SlackBotCoordinator` needs no behavioural change.
- [ ] FR6: Conversation history from Chat SDK `recentMessages` is mapped to the agent input
      (user/assistant roles) exactly as today.
- [ ] FR7: Add Langfuse SDK (verify v3 `langfuse` vs v4 `@langfuse/client` — pick the one aligned
      with `ai@6`; v4 is OTel-based) and a Langfuse client **util singleton** (`src/util/langfuse.ts`)
      configured from `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASEURL`.
- [ ] FR8: The triage agent's `instructions` (system prompt) are fetched from Langfuse by prompt
      name (e.g. `bug-triage-system`), `.compile()`d with any variables, replacing the
      `TRIAGE_SYSTEM_PROMPT` constant as the source of truth.
- [ ] FR9: The fetched prompt version is linked to the Mastra/AI-SDK generation trace
      (via telemetry metadata `langfusePrompt`) so traces show which prompt version ran.
- [ ] FR10: If the Langfuse fetch fails, fall back to a local default prompt (seeded from the
      current `TRIAGE_SYSTEM_PROMPT`) and log a warning — triage must not hard-fail.

### 2.2 Non‑Functional Requirements

- [ ] Performance: Slack Events API requires a response within 3s — agent evaluation must remain
      inside the existing async handler flow (webhook ack is already decoupled via `webhookAdapter`).
- [ ] Security: reuse `ANTHROPIC_API_KEY`; add `LANGFUSE_*` keys (server-side only, never exposed
      to clients). No new public endpoints (Mastra HTTP routes NOT exposed in this phase, or
      explicitly restricted).
- [ ] Reliability: In-memory memory means state is lost on restart — acceptable, matches current
      `createMemoryState()` behaviour.
- [ ] Compliance: Must pass `archgate check` — respect `BE-001`, `GEN-002`, `GEN-001` (no magic
      numbers/strings), `BE-005` value/`BE-006` list domain rules where touched.

---

## 3. Architecture & Design

### 3.1 High‑Level Design

Mastra becomes the **LLM-agent engine** behind the Query layer; the Chat SDK stays the **Slack
transport** in the Transfer layer. The two integrate at `EvaluateBugReportQuery`.

```
Slack ──webhook──▶ SlackEventsController (Controller)
                        │
                        ▼
                 SlackBotCoordinator (Coordinator)  ◀── Chat SDK threads (via SlackTransfer)
                        │  recentMessages
                        ▼
                 EvaluateBugReportQuery (Query) ──▶ Mastra agent (bugTriageAgent)
                        │                                   │  instructions
                        │                              Mastra singleton (src/util/mastra.ts)
                        ▼                                   │  in-memory memory
                 { isComplete, clarifyingQuestion }   Anthropic model (ai-sdk)
                                                            ▲
                                  langfuse util singleton ──┘ fetch+compile prompt,
                                  (src/util/langfuse.ts)      trace + version link
```

**Layer mapping (BE-001 / GEN-002 compliance):**

| Mastra artifact                                            | Layer / location                                          | Rationale                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mastra instance (singleton)                                | `src/util/mastra.ts`                                      | Util is the sanctioned project singleton; all layers may reference it (INDEX.md + `refactor-util-to-singleton`).                                                                                                                                                                |
| `bugTriageAgent` definition                                | `src/slack-bug-intake/agent/bug-triage.agent.ts`          | Feature-scoped; defines system prompt + model + output schema. Registered into the Mastra singleton.                                                                                                                                                                            |
| Agent invocation                                           | `src/slack-bug-intake/query/evaluate-bug-report.query.ts` | Read-only classification → **Query** layer (unchanged public signature).                                                                                                                                                                                                        |
| Slack transport                                            | `src/transfer/slack.transfer.ts` (Chat SDK)               | External service wrapper → **Transfer**. Unchanged.                                                                                                                                                                                                                             |
| Langfuse (singleton, incl. prompt fetch/compile + tracing) | `src/util/langfuse.ts`                                    | Langfuse's role is tracing + prompt retrieval, not a runtime service. It is a cross-cutting singleton usable by all layers — consistent with `langsmith.ts` / `prompt-loader.ts`. Fetches + `.compile()`s prompts, exposes trace/version linking, and holds the local fallback. |
| Module wiring                                              | `src/app.module.ts` + `slack-bug-intake.module.ts`        | NestJS DI.                                                                                                                                                                                                                                                                      |

**Decision — Langfuse lives in `util` as a singleton (not Transfer):** Langfuse is an
observability / prompt-management concern, not a business external service that the Repository
orchestrates. Its purpose is tracing and pulling prompt text — a cross-cutting utility. So the
whole thing (client config, `fetchTriagePrompt()` + `.compile()`, trace/version linking, and the
local fallback) lives in `src/util/langfuse.ts` as a singleton, matching the existing `langsmith.ts`
and `prompt-loader.ts` prompt-infra convention. The Query layer calls the util directly.

**Decision — agent vs tools:** the triage agent is a pure classifier and needs **no tools** (it
does not call Slack/Linear itself). Slack posting and Linear creation remain in the Coordinator via
Transfer/Command, preserving BE-001. If future agents need to call external services, those calls
MUST be wrapped as Mastra tools that delegate to the **Transfer** layer — never call SDKs directly
from an agent/tool.

### 3.2 Affected Components

- **Services:** single NestJS process (fly.io) — no new service.
- **Modules / Packages:** `+@mastra/core`, `+@mastra/nestjs`, `+langfuse` (or `@langfuse/client`);
  `AppModule`, `SlackBugIntakeModule`.
- **DB / Storage:** none (Mastra in-memory memory only). Langfuse stores prompts remotely (Cloud).
- **External APIs / Integrations:** Anthropic via ai-sdk (existing key); Slack via Chat SDK
  (unchanged); **Langfuse** (new) for prompt fetch + trace linking.
- **Config:** new env vars `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASEURL` —
  add to `.env`, `validateEnv()` in `create-app.ts`, and fly.io secrets.

### 3.3 Data Model / API Changes

- **No** DB changes.
- **No** new/changed public HTTP endpoints. Mastra's built-in agent/workflow HTTP routes from
  `@mastra/nestjs` are **not** to be exposed publicly in this phase (confirm registration options;
  if the module auto-mounts routes, gate or disable them).
- Internal contract preserved: `EvaluateBugReportQuery.execute(recentMessages)` →
  `{ isComplete: boolean; clarifyingQuestion: string | null }`.
- **New external dependency:** a Langfuse prompt named `bug-triage-system` (production label) must
  exist in the Langfuse project, seeded from the current `TRIAGE_SYSTEM_PROMPT` text. Document this
  as a one-time setup step (create prompt in Langfuse UI or via SDK seed script).

---

## 4. Implementation Plan

### 4.1 Tasks & Milestones

- [x] Task 1: Installed `@mastra/core@1.49.0` + `@mastra/nestjs@0.2.4` (peer-deps verified vs
      `ai@6`, `zod@4.3.6`, NestJS 11 — all compatible).
- [x] Task 2: Created `src/util/mastra.ts` — `MastraProvider` singleton (in-memory default,
      registers `bugTriageAgent`) per the GEN-002 util-singleton convention.
- [x] Task 3: Created `src/slack-bug-intake/agent/bug-triage.agent.ts` — agent (name/id, dynamic
      Langfuse instructions, `claude-haiku-4-5` model). `EvaluationSchema` exported here, imported
      by the Query.
- [x] Task 4: Installed Langfuse **v3 `langfuse@3.38.20`** (chosen over v4 `@langfuse/client` to
      avoid OTel bootstrapping — matches the simple util-singleton pattern). Created
      `src/util/langfuse.ts` singleton with `fetchTriagePrompt()` (getPrompt + `.compile()` +
      built-in `fallback: TRIAGE_SYSTEM_PROMPT` + try/catch, logged warning on fallback).
      Env var is `LANGFUSE_BASE_URL` (project's existing name), not `LANGFUSE_BASEURL`.
- [ ] Task 5: Seed the `bug-triage-system` prompt in Langfuse (from `TRIAGE_SYSTEM_PROMPT`).
      **Manual/ops step — not done.** Until seeded, the util logs a warning and uses the local
      fallback (safe by design).
- [x] Task 6 (partial): Wired the Langfuse prompt into `bug-triage.agent` `instructions`
      (dynamic async). **Trace/version-linking (`langfusePrompt` telemetry metadata) deferred** —
      requires OTel wiring intentionally skipped with the v3 SDK. Follow-up.
- [x] Task 7: Refactored `EvaluateBugReportQuery.execute()` to `bugTriageAgent.generate(...)` with
      `structuredOutput: { schema: EvaluationSchema }`; same `{ isComplete, clarifyingQuestion }`
      return shape.
- [x] Task 8: Registered `MastraModule.register({ mastra })` in `AppModule` (routes as-is, per
      explicit decision — see security follow-up). `LANGFUSE_*` intentionally **kept optional**
      (not added to `validateEnv`) because the local fallback means Langfuse is not required to boot.
- [x] Task 9: New literals (agent name/id, model id, prompt name) live in
      `src/constants/mastra.constants.ts` (GEN-001).
- [x] Task 10: Updated `evaluate-bug-report.query.test.ts` (mocks the Mastra agent) and added
      `src/util/langfuse.test.ts` (success / fallback-flag / fetch-error paths).
- [x] Task 11: `vp build` (0 errors), oxlint (clean), `archgate check` (11/11, 0 warnings),
      `vp test` (46/46). All green.
- [ ] Task 12: Local E2E via `npm run dev:local` — **not run** (requires live Slack/Langfuse creds).
      Recommended before deploy; also verify the fallback path and (once trace-linking lands) the
      Langfuse trace.

### 4.2 Rollout Strategy

- Environment order: local (`dev:local` + localtunnel) → fly.io (`npm run deploy`).
- Feature flag: optional env toggle (e.g. `TRIAGE_ENGINE=mastra|legacy`) to fall back to
  `generateObject` if the agent misbehaves — decide during implementation; low cost to add.
- Migration steps: none (in-memory, no schema).

### 4.3 Risks & Mitigations

- **Risk:** `@mastra/nestjs` auto-mounts public agent/workflow HTTP routes.
  **Impact:** unintended public surface on the fly.io endpoint.
  **Mitigation:** review registration options; do not expose, or restrict/guard routes; verify with
  a route dump after wiring.
- **Risk:** Mastra pulls a conflicting `ai`/`zod` version.
  **Impact:** build/type breakage.
  **Mitigation:** pin versions, check `pnpm` overrides, run `vp build` in `lint`.
- **Risk:** Structured-output parity — Mastra agent output differs subtly from `generateObject`.
  **Impact:** triage regressions.
  **Mitigation:** identical Zod schema; promptfoo eval (`npm run eval`) + unit tests on golden
  transcripts before/after.
- **Risk:** 3-second Slack ack budget.
  **Impact:** Slack retries / duplicate events.
  **Mitigation:** webhook ack already decoupled (`webhookAdapter.dispatch`); keep agent call in the
  async handler, not the ack path.
- **Risk:** Langfuse prompt fetch latency or outage on every triage turn.
  **Impact:** slower triage / failure if Langfuse is down.
  **Mitigation:** rely on the Langfuse SDK's built-in prompt caching (TTL); local fallback prompt
  (FR10) so triage never hard-fails; fetch is off the Slack ack path.
- **Risk:** Langfuse SDK version split (`langfuse` v3 vs `@langfuse/client` v4) and OTel/trace
  wiring conflicting with Mastra's own telemetry.
  **Impact:** duplicate/broken traces or build breakage.
  **Mitigation:** pick one SDK aligned with `ai@6`; verify Mastra↔Langfuse tracing approach during
  Task 7; pin versions; validate with `vp build`.
- **Risk:** Prompt drift — Langfuse prompt edited in UI diverges from tested behaviour.
  **Impact:** silent triage regressions from a non-code change.
  **Mitigation:** use the `production` label deliberately; keep promptfoo eval on the canonical
  prompt; treat prompt edits as reviewable changes.

---

## 5. Monitoring & Operations

- Logs: reuse the Pino `logger`; log agent invocation start/end + token usage per thread (mirror the
  existing `🔧`/`🤖` log style). Truncate payloads with `LOG_TRUNCATE_LENGTH`. Log a warning when
  the Langfuse fallback prompt is used.
- Metrics: token usage from Mastra agent result; clarification-round counts.
- **Langfuse dashboard:** traces linked to prompt versions — use it to inspect triage runs, compare
  prompt versions, and iterate on the prompt without redeploying.
- Alerts: none new in this phase; consider alerting on repeated Langfuse fallback warnings.
- Runbook: if triage regresses, flip `TRIAGE_ENGINE=legacy` (if implemented) or redeploy previous
  build via `fly deploy`; check `npm run deploy:logs`.

```

```
