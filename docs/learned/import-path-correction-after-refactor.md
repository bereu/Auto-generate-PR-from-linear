# What I Learned: Import Path Correction After Folder Refactor

**Date:** 2026-03-28

## What I Learned This Session

### 1. TypeScript path aliases are NOT updated automatically when folders are renamed

After the layer architecture refactor, code still used old `@/issue/...` aliases that no longer matched any real path. The compiler and linter did not always catch these — some failures only appeared at runtime.

The mapping that was broken after the refactor:

| Old (wrong) path                          | New (correct) path                                 |
| ----------------------------------------- | -------------------------------------------------- |
| `@/issue/domain/linear-issue`             | `@/domain/issue/linear-issue`                      |
| `@/issue/domain/value/issue-id`           | `@/domain/issue/value/issue-id`                    |
| `@/issue/domain/value/issue-title`        | `@/domain/issue/value/issue-title`                 |
| `@/issue/transfer/linear.transfer`        | `@/transfer/linear.transfer`                       |
| `@/issue/repository/issue.repository`     | `@/linear-webhook/repository/issue.repository`     |
| `@/issue/command/implement-issue.command` | `@/linear-webhook/command/implement-issue.command` |
| `@/issue/command/suspend-issue.command`   | `@/linear-webhook/command/suspend-issue.command`   |
| `@/prompt-loader`                         | `@/util/prompt-loader`                             |

**Why this happened:** The refactor moved files into new folders (`src/domain/`, `src/linear-webhook/`, `src/transfer/`, `src/util/`) but the import strings in consuming files were not updated. There is no tooling in this project that automatically repoints alias imports.

**How to apply:** After any folder rename or file move, grep for all import paths referencing the old location before finishing the refactor:

```bash
grep -r "@/issue/" src/
grep -r "@/prompt-loader" src/
```

### 2. Confirmed folder structure after layer architecture refactor

```
src/
  domain/issue/            ← Domain objects only (no NestJS decorators)
    linear-issue.ts
    value/
      issue-id.ts
      issue-title.ts
  linear-webhook/          ← NestJS webhook slice
    command/
      implement-issue.command.ts
      suspend-issue.command.ts
    controller/
      linear-webhook.controller.ts
    repository/
      issue.repository.ts
    linear-webhook.module.ts
  transfer/
    linear.transfer.ts     ← Only place that may touch LinearClient
  util/
    prompt-loader.ts
```

### 3. NestJS module controller path must include the subfolder explicitly

`linear-webhook.module.ts` had the controller path as `./linear-webhook.controller`. After the controller was moved into `./controller/`, the module needed updating to `./controller/linear-webhook.controller`. NestJS does NOT search subfolders — it resolves the exact path given.

**Symptom:** NestJS would start without error but routes were not registered.

### 4. `.ts` extension in imports: do NOT include it (contradicts earlier note)

An earlier session doc (`layer-architecture-refactor-execution.md`) stated that `.ts` extensions are _required_ because `tsx` runs source directly. This session found the opposite: linting fails with `.ts` extensions present, and all 16 affected files needed `.ts` removed.

The `tsconfig.json` has `allowImportingTsExtensions: true`, which permits both forms — but the linter enforces the no-extension convention. The runtime (`tsx`) accepts both.

**Rule:** Do NOT include `.ts` in import paths. The correct form is:

```typescript
// Correct
import { LinearIssue } from "@/domain/issue/linear-issue";

// Will fail lint
import { LinearIssue } from "@/domain/issue/linear-issue.ts";
```

The earlier doc was wrong about `.ts` being required. Treat this file as the authoritative reference.

### 5. Removing a provider from module: must also remove from the module file

`IssueEventService` was deleted during the refactor but remained listed as a provider in `linear-webhook.module.ts`. NestJS throws at startup because it cannot find the class. The module file is the single place that registers all providers — it is not self-healing.

## Docs & Info That Would Speed Things Up Next Time

- Run `npm run lint && npm run test` immediately after any folder rename. Lint catches missing modules and `.ts` extension issues before runtime.
- `src/linear-webhook/linear-webhook.module.ts` — always review after any controller/service move to ensure paths and providers are still accurate.
- `tsconfig.json` — `allowImportingTsExtensions: true` means both forms compile, but only the no-extension form passes lint.
