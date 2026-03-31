# Agent Execution Plan: Refactor github.ts from Util to Transfer Layer

## 1. Plan Overview

Move `src/util/github.ts` to `src/transfer/github.transfer.ts` as a proper `GithubTransfer` singleton/injectable class. Per `BE-001`, the Transfer layer is the correct home for code that accesses external services. GitHub API (via Octokit) is an external service, so it must not live in `src/util/`.

## 2. Why It Is Needed

`BE-001` defines Transfer as: _"Wrapper for accessing external services (e.g., Firebase, third-party APIs). Accessed by the Repository layer."_

`github.ts` calls the GitHub REST API via Octokit — that is external service access. Placing it in `src/util/` violates the layer rule and allows any layer to call it directly, bypassing the Repository → Transfer contract.

`agent.ts` currently calls `fetchPrUrl` directly (not via a repository), which is also a layer violation that this refactor will fix by routing through `IssueRepository`.

## 3. Current State vs Target

**Current:**

- `src/util/github.ts` — module-level `_octokit` + `getOctokit()` helper + exported `fetchPrUrl()` function
- `agent.ts` calls `fetchPrUrl` directly

**Target:**

- `src/transfer/github.transfer.ts` — `GithubTransfer` class (singleton or `@Injectable()` consistent with `LinearTransfer`)
  - `fetchPrUrl(repoFullName: string, branch: string): Promise<string | null>`
- `IssueRepository` gets a `GithubTransfer` injected and exposes `fetchPrUrl(repoFullName, branch)`
- `agent.ts` calls `issueRepository.fetchPrUrl(...)` — no direct Transfer call

## 4. Action List

- [x] Create `src/transfer/github.transfer.ts` as a class mirroring `LinearTransfer` style (lazy-init Octokit in private `client()` method)
- [x] Move `fetchPrUrl` logic into `GithubTransfer.fetchPrUrl()`
- [x] Add `GithubTransfer` as a constructor dependency of `IssueRepository`
- [x] Add `fetchPrUrl(repoFullName, branch)` method to `IssueRepository` that delegates to `GithubTransfer`
- [x] Update `agent.ts` to call `issueRepository.fetchPrUrl(repoFull, workBranch)` instead of importing from util
- [x] Update `createIssueRepository()` factory in `agent.ts` to inject `new GithubTransfer()`
- [x] Update `src/util/github.test.ts` → `src/transfer/github.transfer.test.ts` to test the new class
- [x] Delete `src/util/github.ts` and `src/util/github.test.ts`
- [x] Run `npm run test` and `npm run lint`

## 5. AC (Acceptance Criteria)

- [ ] `src/util/github.ts` no longer exists
- [ ] `src/transfer/github.transfer.ts` exists with `GithubTransfer` class
- [ ] `agent.ts` has no direct import from `@/util/github` or `@/transfer/github.transfer`
- [ ] `IssueRepository` is the only caller of `GithubTransfer`
- [ ] Tests for `GithubTransfer` cover: PR found, no PR, API error, invalid repo name
- [ ] `npm run test` passes
- [ ] `npm run lint` passes
