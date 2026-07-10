---
id: BE-003
title: Error-handling
domain: backend
rules: false
---

# Error-handling-with-Rollbar

## Context

We need to establish a consistent pattern for error handling across the application and define a structured way to report these errors to our monitoring service, Rollbar. We primarily encounter two distinct types of errors:

1. **Business Logic Errors**: These are errors where an action is impossible within the valid business workflow. For example: A non-existent user attempting to create a project or a todo item.
2. **System Errors**: These are unexpected technical failures, such as 500 Internal Server errors, type errors, database connection failures, etc.

Both types of errors need to be handled appropriately and monitored to ensure system reliability and a good user experience.

## Decision

1. We must explicitly manage error handling throughout the application, categorizing errors as either **Business Logic Errors** or **System Errors**.
2. When an error is handled, we will send an error report to Rollbar.
3. Every Rollbar error report must include relevant **properties** (e.g., user ID, resource ID, action attempted) that provide sufficient context for debugging.
4. **Reporting is centralized in the `Logger` singleton** (`src/util/logger.ts`), the single observability utility that owns both local `pino` logging and the Rollbar client. Code MUST report errors through `logger.warn` / `logger.error` / `logger.critical` and MUST NOT instantiate a Rollbar client anywhere else. Observability is one responsibility and lives in the util layer (see [Layer Architecture of BE](./BE-001-layer-architecture.md) and [Project Folder Structure](./GEN-002-project-folder-structure.md)), never in the Transfer layer.
5. **Severity mapping** ties the error category to a Rollbar severity:
   - A handled **Business Logic Error** is reported at Rollbar `warning`.
   - A **System Error** is reported at Rollbar `error`.
   - A fatal/bootstrap failure is reported via `logger.critical(err)` at Rollbar `critical`.
6. **Contextual properties** are passed via the optional second argument: `logger.error(message, { error, properties })` (same shape for `warn`). A `BusinessError`'s curated `.properties` (e.g. `issueId`, `repoLabel`) are automatically merged into the Rollbar payload; any explicit `properties` win on key collision.
7. **Graceful degradation**: when `ROLLBAR_ACCESS_TOKEN` is unset (local development, CI, tests) the Rollbar client is constructed with `enabled: false`, making every report a silent no-op. The application MUST never hard-fail on a missing token. `ROLLBAR_ACCESS_TOKEN`, `ROLLBAR_ENVIRONMENT`, and `ROLLBAR_CODE_VERSION` are all optional environment variables.
8. **Structural PII/secret safety**: sensitive values are masked by Rollbar `scrubFields` (`token`, `access_token`, `secret`, `password`, `authorization`, `apiKey`, `api_key`, `signature`, `email`) configured on the client, in addition to the reviewer-enforced rule below.

## Do's and Don'ts

### Do

- **DO** attach relevant contextual properties when sending errors to Rollbar (e.g., parameters, state, or user identifiers).
- **DO** distinguish between business logic errors (which might be expected under certain bad inputs) and system errors.
- **DO** create and use custom error classes (e.g. `BusinessError` subclasses) to represent specific business logic failures.
- **DO** report handled errors through `logger.warn` / `logger.error` / `logger.critical`, which forward to Rollbar — never by importing or constructing Rollbar directly.
- **DO** populate a custom error's `.properties` (e.g. `{ issueId }`) in its constructor so debugging context reaches Rollbar automatically when the error is reported.
- **DO** pass `{ error }` (and any extra `properties`) to the logger so business-vs-system severity is inferred and context is forwarded.
- **DO** recognise errors that cross a Mastra workflow boundary by a stable marker message, not `instanceof` alone. When a custom error is thrown inside a workflow step, Mastra does not rethrow it — the run resolves with status `"failed"` and the error is serialized into `result.error`, which strips the class prototype, so `error instanceof MyCustomError` FAILS at the layer inspecting `result.error` (e.g. the coordinator). Export a marker constant from the error's module (e.g. `INSUFFICIENT_BUG_DETAIL_MESSAGE` in `src/constants/errors/business.error.ts`) and match on both `instanceof` AND `error.message.startsWith(MARKER)` (see `classifyTriageError` in `src/slack-bug-intake/triage-error.ts`).

### Don't

- **DON'T** send sensitive user information (PII, passwords, tokens) in the properties sent to Rollbar.
- **DON'T** swallow generic system errors without logging them to Rollbar.
- **DON'T** let business logic errors trigger unhandled exception crashes.
- **DON'T** create a separate Rollbar singleton or module — reporting is a responsibility of the `Logger` util singleton (see [BE-001](./BE-001-layer-architecture.md) / [GEN-002](./GEN-002-project-folder-structure.md)).
- **DON'T** report the same error more than once. Report each handled error exactly once, at the layer that owns handling — do not log-and-report at a lower layer and then re-report after a rethrow in the command/controller layer.
- **DON'T** rely on `instanceof` to classify an error retrieved from a Mastra workflow's `result.error` — the prototype does not survive serialization. Combine it with a marker-message check.

## Implementation Pattern

```typescript
// Custom business error carries curated, non-sensitive context.
export class UnknownRepoError extends BusinessError {
  constructor(issueId: string, repoLabel: string) {
    super(`Unknown repo label: ${repoLabel}`, { issueId, repoLabel });
    this.name = "UnknownRepoError";
  }
}

// Reporting always goes through the logger util singleton.
try {
  await processIssue(issue);
} catch (err) {
  if (err instanceof BusinessError) {
    // Business Logic Error → Rollbar `warning`. `err.properties` (issueId,
    // repoLabel) are auto-merged; the explicit `properties` win on collision.
    logger.warn(`[${issueId}] ${err.message}`, { error: err, properties: { issueId } });
  } else {
    // System Error → Rollbar `error`.
    logger.error(`[${issueId}] ${err.message}`, { error: err, properties: { issueId } });
  }
}

// Fatal/bootstrap failure → Rollbar `critical`.
bootstrap().catch((err: Error) => {
  logger.critical(err);
  process.exit(1);
});
```

## Consequences

### Positive

- Faster debugging and issue resolution due to property-rich error logs in Rollbar.
- Clear separation between expected workflow violations (business logic) and unexpected bugs (system errors).
- Better visibility into the overall health and user-facing issues of the application.

### Negative

- Slightly more verbose code to ensure properties are properly caught and passed to Rollbar.
- Increased dependency on the external Rollbar service for error monitoring.

### Risks

- Accidental leakage of sensitive user data if error properties are not carefully sanitized before being sent to Rollbar.
- Potential to overwhelm Rollbar quotas if business logic errors are triggered excessively by malicious or buggy clients.

## Compliance and Enforcement

- Code reviews will strictly check that appropriate context and properties are passed when logging errors to Rollbar.
- Custom error abstractions (`BusinessError` and subclasses) make logging property-rich business logic and system errors the path of least resistance.
- Reviewers MUST verify that new error-reporting code routes through `logger.warn/error/critical` and does not import or construct Rollbar directly, and that each handled error is reported exactly once.
- The `Logger` singleton and its `src/util/` placement are enforced by the GEN-002 automated rules (`util-must-be-singleton-class`, `util-no-exported-functions`).

## References

- [Rollbar Node.js SDK Documentation](https://docs.rollbar.com/docs/nodejs)
- [Rollbar JavaScript Documentation](https://docs.rollbar.com/docs/javascript)
- [Layer Architecture of BE](./BE-001-layer-architecture.md) — observability belongs in the util layer, not Transfer
- [Project Folder Structure](./GEN-002-project-folder-structure.md) — `src/util/` singleton convention
