# What I Learned: GEN-002 Folder Refactor and Build Setup

**Date:** 2026-03-28

## What I Learned This Session

### 1. `oxlint.config.js` top-level rule is not enough for `src/**` — an explicit override is required

The `no-relative-import-paths` rule was added at the top level of `oxlint.config.js`, but relative imports in `src/**/*.ts` were still not caught without an explicit `overrides` entry scoped to that glob.

**What was added:**

```js
overrides: [
  // ...existing overrides...
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "no-relative-import-paths/no-relative-import-paths": "error",
    },
  },
],
```

**Why this matters:** Without the override, `vp build` would pass lint even if relative imports existed in `src/`. The bug would only surface if someone manually ran `npm run lint` with the correct scope. Adding the override to `oxlint.config.js` makes the build itself enforce the rule.

**Where to check:** `oxlint.config.js` — the `overrides` array. If a new top-level directory (e.g., `workers/`) is added to the project, it needs its own override entry if relative imports must be forbidden there.

### 2. GEN-002 refactor: three waves of errors in sequence

When executing the GEN-002 folder structure alignment, errors came in a predictable three-wave pattern:

1. **Wave 1 — broken imports**: Old `@/issue/...` aliases don't resolve. Fix: update all import paths.
2. **Wave 2 — `.ts` extension violations**: Files copied into new folders had `.ts` extensions in imports. Fix: strip `.ts` from all imports.
3. **Wave 3 — relative import violations**: Entry-point files (`main.ts`, `app.module.ts`, etc.) still used `./` or `../`. Fix: rewrite as `@/` aliases.

These waves are independent — fixing wave 1 doesn't expose wave 2 until lint runs. Running `npm run lint` after each wave is faster than trying to fix all three simultaneously.

### 3. NestJS module `providers` array is NOT self-healing after file deletion

When `IssueEventService` was removed during the refactor, it was still listed in `linear-webhook.module.ts` providers array. NestJS threw at startup:

```
Error: Nest can't resolve dependencies of the LinearWebhookModule
```

There is no compiler warning for this. The only detection is startup. **Rule:** whenever a class is deleted, grep for its name across all `*.module.ts` files before finishing.

```bash
grep -r "IssueEventService" src/**/*.module.ts
```

### 4. `vp build` is the integration check for all three violations

Running `vp build` (not just `npm run lint`) is the definitive check because it runs lint + SSR bundle in sequence. A lint-passing file can still fail the SSR bundle step for different reasons (missing module, wrong target). Use `vp build` as the final gate before commit.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/GEN-002-project-folder-structure.md` — canonical folder map; check this before placing any new file.
- `oxlint.config.js` — add a new `overrides` entry for any new top-level directory.
- `src/linear-webhook/linear-webhook.module.ts` — always grep for deleted class names here after any refactor.
- `docs/learned/import-path-correction-after-refactor.md` — full alias mapping table for the GEN-002 refactor.
- `docs/learned/vite-ssr-build-and-relative-import-lint.md` — why `vp build` enforces `no-relative-import-paths` and the SSR config pattern.
