# Refactor: Type Safety and Client Singleton

## Context

Code review and learned-session notes (`docs/learned/session-2026-03-22-sdk-refactoring-and-testing.md`) identified three areas needing cleanup:

1. `linear.ts` — `getClient()` creates a new `LinearClient` on every invocation
2. `agent.ts` — unsafe `as { ... }` type assertions on `SDKMessage` result
3. `prompt-loader.ts` — nunjucks silently swallows undefined template variables

## Current vs Target State

| File                   | Current                                                        | Target                         |
| ---------------------- | -------------------------------------------------------------- | ------------------------------ |
| `src/linear.ts`        | `new LinearClient(...)` on every call                          | Module-level singleton         |
| `src/agent.ts`         | `result as { subtype?: string }` / `result as { usage?: ... }` | Named types or narrowed checks |
| `src/prompt-loader.ts` | Default nunjucks (silent undefined)                            | `throwOnUndefined: true`       |

## Action Items

- [x] `src/linear.ts`: Replace per-call `getClient()` with module-level singleton
- [x] `src/agent.ts`: Define `ClaudeResult` interface for the result message; remove unsafe casts
- [x] `src/prompt-loader.ts`: Configure nunjucks with `throwOnUndefined: true`

## Acceptance Criteria

- `npm run lint` passes with zero errors
- All existing behaviour preserved (no API/signature changes)
- No unsafe `as { ... }` casts remain in `agent.ts`
