# What I Learned: Technology-Named Files Must Not Contain Domain Logic

**Date:** 2026-03-27

## What I Learned This Session

### `linear.ts` is a naming smell — technology names should only hold adapters

`src/linear.ts` currently contains:

1. A re-export of `LinearIssue` from the domain layer — unnecessary because callers can import directly.
2. A `resolveRepo()` function that determines which git repository an issue belongs to based on the issue's title/description text.

The file is named after the technology (`linear` → Linear.app SDK), but it contains **business logic** — the heuristic that maps issue text to a repo name. This is a domain concern, not an SDK concern.

**The rule:** Files named after a technology or external service (e.g., `linear.ts`, `github.ts`, `fly.ts`) must only contain:

- SDK client initialization
- Adapter/anti-corruption layer code that translates SDK types to domain types

They must NOT contain business logic that could live in a domain-named file.

### Re-exporting a domain type from a technology-named file is a code smell

```typescript
// linear.ts — WRONG
export { LinearIssue } from "@/issue/domain/linear-issue.ts";
```

This adds an indirection with no value. Callers should import directly from the domain:

```typescript
// CORRECT at call sites
import { LinearIssue } from "@/issue/domain/linear-issue.ts";
```

The re-export exists because the file was created as a "Linear utilities" module before the `src/issue/` domain layer existed. After the domain was introduced, the re-export became stale and the business logic (`resolveRepo`) should have been moved.

### Where `resolveRepo` should live

`resolveRepo(issue, repoNames)` is a domain operation: given an issue, find which repo it belongs to. Candidates:

- Inline into `agent.ts` (only call site) — acceptable if the function stays small and is not reused.
- Move to `src/issue/domain/` as a domain service — appropriate if other callers emerge.
- Move to `src/issue/repository/` — appropriate if it grows into a "repo resolution" concern.

The filename `linear.ts` gives no indication of this behaviour. A reader seeing `linear.ts` expects SDK adapter code.

## What a New Team Member Should Know

- Do not add domain logic to technology-named files. If you need to put business logic somewhere, create a domain-named file (e.g., `issue-repo-resolver.ts`) rather than placing it in `linear.ts` or similar.
- `src/linear.ts` is flagged for refactoring — do not add more code to it.
- Re-exports that add no transformation are always suspicious. Before adding `export { X } from "..."` in a pass-through file, ask if the file should exist at all.

## Docs & Info That Would Speed Things Up Next Time

- `src/issue/` — the domain layer introduced after `linear.ts`. Business logic for issues belongs here.
- `docs/adr/BE-001-layer-architecture.md` — layer rules; technology adapters belong in `infrastructure/` or similar, not as top-level `src/*.ts` files.
- `src/agent.ts` — the only call site of `resolveRepo()`. Check here when deciding whether to inline or extract.
