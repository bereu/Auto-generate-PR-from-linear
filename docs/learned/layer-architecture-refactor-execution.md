# What I Learned: Layer Architecture Refactor Execution

**Date:** 2026-03-27

## What I Learned This Session

### 1. Commands in NestJS DI vs. agent.ts factory pattern — two worlds

`ImplementIssueCommand` is `@Injectable()` and registered in `WebhookModule`. It is resolved by NestJS.

`IssueRepository` and `LinearTransfer` are **not** `@Injectable()` and are never registered in any NestJS module. They are instantiated manually via factory functions inside `agent.ts`:

```typescript
function createIssueRepository(): IssueRepository {
  return new IssueRepository(new LinearTransfer());
}
```

**Why:** `agent.ts` runs outside the NestJS lifecycle (it's called as a fire-and-forget from the command layer). NestJS DI only governs what happens during a request. The `IssueRepository` lifecycle is per-task, not per-request.

**Gotcha:** `ImplementIssueCommand` calls `processIssue()` from `agent.ts`, which then creates its own `IssueRepository` instance internally. This means the Command layer does not hold a repository reference — it fires the agent which manages its own repository.

### 2. `IssueRepository` methods take `string`, not `IssueId`

Despite `IssueId` Value Domain existing, repository methods accept plain `string`:

```typescript
async startImplementation(issueId: string): Promise<void>
```

Callers do `.id().value()` to unwrap. The Repository boundary deliberately uses primitives — this avoids coupling the Repository to domain object internals and keeps Repository methods usable even if the caller only has a raw ID (e.g., from a polling loop).

### 3. `LinearTransfer` lazy-initializes `LinearClient`

```typescript
private _client: LinearClient | null = null;

private client(): LinearClient {
  if (!this._client) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) throw new Error("LINEAR_API_KEY is not set");
    this._client = new LinearClient({ apiKey });
  }
  return this._client;
}
```

The client is not created at constructor time. `LINEAR_API_KEY` is only checked when the first actual Linear call is made. This avoids throwing at module load during tests where the env var is not set.

### 4. Import extensions: do NOT include `.ts` — linter will reject it

⚠️ **This section was corrected on 2026-03-28** — the original guidance was wrong.

`tsconfig.json` has `allowImportingTsExtensions: true`, which means the runtime accepts both forms. However, the linter enforces the **no-extension** convention. Always omit the extension:

```typescript
// Correct
import { IssueRepository } from "@/linear-webhook/repository/issue.repository";

// Fails lint (do not use)
import { IssueRepository } from "@/linear-webhook/repository/issue.repository.ts";

// Also wrong — this project does not emit .js files
import { IssueRepository } from "@/linear-webhook/repository/issue.repository.js";
```

See `docs/learned/import-path-correction-after-refactor.md` for the authoritative rule.

### 5. Constants in `repos.config.ts` — it's not just repo config

`repos.config.ts` is the single source for **all** business constants, not just repository/infrastructure config. This session moved `ISSUE_EVENT_TYPE` and `ISSUE_TRIGGER_ACTIONS` from `webhook.service.ts` into `repos.config.ts`.

The rule: if it's a constant used in business logic filtering or routing, it belongs in `repos.config.ts` — regardless of which layer first needed it.

### 6. `SuspendIssueCommand` is wired by sharing the same repository instance

Inside `processIssue()`, the suspend command is constructed using the same `IssueRepository` created at task start:

```typescript
const issueRepository = createIssueRepository();
// ...
const suspendIssue = createSuspendIssueCommand(issueRepository);
```

This ensures the suspend path and the main execution path operate on the same Linear client instance and share state. If you refactor this to use a new `IssueRepository` inside `SuspendIssueCommand`, you lose that guarantee.

### 7. `ImplementIssueCommand` does not validate signature — that's `IssueEventService`

The Command layer receives an already-verified payload. Signature verification happens entirely in `IssueEventService` (the thin service) before the command is called. If you add a new entry point (e.g., polling), it must perform its own signature handling (or skip it if not applicable) — it must **not** add signature logic to the Command.

## What a New Team Member Should Know

- **`IssueRepository` is not a NestJS provider.** Don't add `@Injectable()` to it — it's instantiated per-task in `agent.ts`, not per-request.
- **All `.ts` imports must use `.ts` extension**, not `.js`. `tsx` runs source directly.
- **`repos.config.ts` owns all constants** — even event type strings. Check there first before defining a new constant anywhere.
- **Repository methods use `string` IDs**, not `IssueId`. Always unwrap with `.id().value()` before calling repository methods.
- **`IssueEventService` = signature verification only.** All business logic lives in `ImplementIssueCommand`.

## Docs & Info That Would Speed Things Up Next Time

- `src/agent.ts` — understand the `createIssueRepository()` factory pattern before assuming NestJS DI is used everywhere.
- `src/repos.config.ts` — all constants are here, including event type strings. Read before adding any new constant.
- `docs/adr/BE-001-layer-architecture.md` — Transfer layer is layer 7; only `LinearTransfer` may instantiate `LinearClient`.
- `tsconfig.json` — check `moduleResolution` to understand why `.ts` extensions are required.
