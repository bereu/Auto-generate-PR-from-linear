# Agent Execution Plan: Install Rollbar for Log & Error Reporting

## 1. Plan Overview

Add [Rollbar](https://docs.rollbar.com/docs/nodejs) as the error/log monitoring
service for the application. Rollbar reporting is **unified into the existing
`Logger` singleton** in `src/util/logger.ts` (local pino logging + remote Rollbar
reporting are one observability responsibility, so they share one utility), with
property-rich context passed at the existing catch sites. This directly
implements **ADR BE-003 (Error-handling-with-Rollbar)**, which names Rollbar as
the designated monitoring service.

> **Design revision:** an earlier draft added a _separate_ `src/util/rollbar.ts`
> singleton. Per review feedback that this duplicated the logger's responsibility,
> Rollbar was merged into `Logger`. There is no standalone `rollbar` singleton;
> the `Logger` instance owns the Rollbar client internally.

## 2. Why It Is Needed

- **BE-003** mandates that "when an error is handled, [the app] will send an
  error report to Rollbar" with relevant contextual **properties**, and that
  errors be categorized as **Business Logic Errors** vs **System Errors**.
  Rollbar is not yet installed — this closes that governance gap.
- **BE-001** classifies observability/tracing as a cross-cutting infrastructure
  concern that belongs in `src/util/` singletons (like Langfuse/Mastra), **not**
  the Transfer layer. Rollbar is observability, so it lives in `src/util/`.
- **GEN-002** confirms utility singletons live in `src/util/`.

## 3. Current State vs Target

**Current:**

- `src/util/logger.ts` — pino singleton (`logger.info/warn/error/debug(msg: string)`).
- Error classes: `BusinessError` (+ subclasses) carry a curated `properties` bag
  (`src/constants/errors/business.error.ts`); system errors are thrown as
  generic `Error` with messages from `src/constants/message/error/system.error.ts`.
- Errors are handled (logged only) at: `agent.ts` `handleProcessIssueError`,
  `implement-issue.command.ts`, and the `bootstrap().catch` in `main.ts` /
  `main.local.ts`. **Nothing is sent to any monitoring service.**

**Target:**

- `rollbar` dependency installed.
- `src/util/rollbar.ts` — `Rollbar` singleton. Reports handled errors with
  contextual properties; auto-merges `BusinessError.properties`.
- `logger.error` / `logger.warn` forward to Rollbar (per chosen design), with an
  extended signature accepting an optional `Error` + `properties` so BE-003's
  property-rich requirement is preserved.
- Catch sites pass the `Error` object + context properties into the logger.
- `ROLLBAR_ACCESS_TOKEN` documented and treated as **optional** — when unset the
  client is disabled (no-op), so local dev / tests never hard-fail.

## 4. Design Decisions (confirmed)

- **Logger wiring: auto-forward.** `logger.error`/`logger.warn` route through
  Rollbar in addition to pino. To stay BE-003-compliant (property-rich context),
  the logger methods gain an optional second arg
  `{ error?: Error; properties?: Record<string, unknown> }`. Existing
  string-only calls keep working; the message is still sent to Rollbar.
- **Missing token: disable silently.** With no `ROLLBAR_ACCESS_TOKEN`, construct
  the client with `enabled: false` and emit one `console.warn` (not `logger`, to
  avoid an import cycle). Mirrors the Langfuse local-fallback behavior.
- **No import cycle.** `logger.ts` imports `rollbar`; therefore `rollbar.ts`
  must NOT import `logger` — it uses `console` for its own one-time notice.
- **PII/secret safety (BE-003 "Don't").** Configure Rollbar `scrubFields` for
  `token`, `access_token`, `secret`, `password`, `authorization`, `apiKey`,
  `signature`, `email`, etc. `BusinessError.properties` are already curated
  (`issueId`, `repoLabel`) and safe.

## 5. Action List

- [x] `pnpm add rollbar`
- [x] Create `src/util/rollbar.ts` — `Rollbar` singleton mirroring `Langfuse`:
  - [x] `getInstance()` + `export const rollbar`
  - [x] constructor: `new RollbarSDK({ accessToken, enabled, environment, captureUncaught: true, captureUnhandledRejections: true, scrubFields, payload: { code_version } })`
  - [x] `report(error, properties?)` — system errors; merges `BusinessError.properties`
  - [x] `critical(error, properties?)` — fatal (bootstrap failures)
  - [x] `warn(message, properties?)` — handled business-logic warnings
  - [x] `info(message, properties?)`
  - [x] does **not** import `@/util/logger`
- [x] Extend `src/util/logger.ts`:
  - [x] `error(msg, ctx?: { error?: Error; properties?: Record<string, unknown> })` → pino + `rollbar.report`/`rollbar.warn`
  - [x] `warn(msg, ctx?)` → pino + `rollbar.warn`
  - [x] keep `info` / `debug` pino-only
- [x] Wire context at catch sites (categorize per BE-003):
  - [x] `agent.ts` `handleProcessIssueError`: business-error branches → `logger.warn(msg, { error: err })`; system-error branch → `logger.error(msg, { error: err, properties: { issueId } })`
  - [x] `linear-webhook/command/implement-issue.command.ts` catch → pass `{ error: err, properties: { issueId } }`
  - [x] `main.ts` & `main.local.ts` `bootstrap().catch` → `rollbar.critical(err)` (uncaught also covered by `captureUncaught`)
- [x] Config:
  - [x] `.env.example` — add "Rollbar (Optional)" block: `ROLLBAR_ACCESS_TOKEN`, `ROLLBAR_ENVIRONMENT`, `ROLLBAR_CODE_VERSION`
  - [x] `create-app.ts` `validateEnv` — leave Rollbar vars optional (add clarifying comment like the `LANGFUSE_*` note)
- [x] Tests:
  - [x] `src/util/rollbar.test.ts` — mock the `rollbar` SDK; assert: disabled/no-op without token, `BusinessError.properties` merged into payload, `scrubFields` configured, correct severity mapping (report→error, critical→critical, warn→warning)
  - [x] update `src/util/logger.test.ts` (or create) — `logger.error`/`warn` forward to a mocked `rollbar`; string-only calls still work
- [x] Validate: `npm run test`, then `npm run lint` (runs `archgate check`), then invoke `@architect` and `@quality-manager` skills; fix all violations, surface all warnings.

## 6. AC (Acceptance Criteria)

- [x] `rollbar` is in `package.json` dependencies
- [x] `src/util/rollbar.ts` exports a `Rollbar` singleton + `rollbar` instance
- [x] `rollbar.ts` has no import from `@/util/logger` (no cycle)
- [x] With `ROLLBAR_ACCESS_TOKEN` unset, no report is sent and startup succeeds
- [x] Handled errors at `agent.ts` / `implement-issue.command.ts` produce Rollbar reports carrying `issueId` (and `repoLabel` for `UnknownRepoError`)
- [x] Business vs System errors map to `warning` vs `error` severity (BE-003 categorization)
- [x] No secret/PII field names are sent unscrubbed (BE-003)
- [x] `npm run test` passes
- [x] `npm run lint` passes (incl. `archgate check`)

## 7. Files Touched

| File                                                    | Change                                          |
| ------------------------------------------------------- | ----------------------------------------------- |
| `package.json`                                          | add `rollbar` dep                               |
| `src/util/rollbar.ts`                                   | **new** singleton                               |
| `src/util/rollbar.test.ts`                              | **new** tests                                   |
| `src/util/logger.ts`                                    | forward error/warn to Rollbar, extend signature |
| `src/util/logger.test.ts`                               | **new/updated** tests                           |
| `src/agent.ts`                                          | pass error + `{ issueId }` context              |
| `src/linear-webhook/command/implement-issue.command.ts` | pass error + context                            |
| `src/main.ts`, `src/main.local.ts`                      | `rollbar.critical` on fatal bootstrap           |
| `.env.example`                                          | Rollbar (Optional) env block                    |
| `src/create-app.ts`                                     | comment: Rollbar vars optional                  |

## 8. Out of Scope

- Rollbar source-map upload / release tracking in the deploy pipeline (`fly deploy`) — follow-up.
- Reworking existing error-class taxonomy (covered by `refactor-business-error-handling`).

## References

- `docs/adr/BE-003-error-handling.md`
- `docs/adr/BE-001-layer-architecture.md`
- `docs/adr/GEN-002-project-folder-structure.md`
- [Rollbar Node.js SDK](https://docs.rollbar.com/docs/nodejs)
