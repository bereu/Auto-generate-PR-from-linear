# What I Learned: GEN-002 Folder Refactor — Session Synthesis

**Date:** 2026-03-28

## What I Learned This Session

### 1. oxlint top-level rule does NOT apply to `src/` without an explicit override

Adding a rule at the top of `oxlint.config.js` is not enough for the `src/**` directory. An explicit `overrides` entry is required:

```js
{
  files: ["src/**/*.ts", "src/**/*.tsx"],
  rules: {
    "no-relative-import-paths/no-relative-import-paths": "error",
  },
}
```

Without this, relative imports in `src/` pass lint silently. This is the pattern for every top-level directory — `client/`, `server/`, `src/` each need their own override.

### 2. Folder refactors produce errors in three predictable waves

When aligning folders to GEN-002, errors always arrive in this order:

1. **Wave 1 — broken alias imports**: Old `@/issue/...` paths don't resolve after files moved.
2. **Wave 2 — `.ts` extension violations**: Files copied to new folders still have `.ts` in their imports.
3. **Wave 3 — relative import violations**: Entry files (`main.ts`, `app.module.ts`) still use `./` or `../`.

Fix one wave at a time with `npm run lint` between each. Trying to fix all three simultaneously causes confusion about which error belongs to which wave.

### 3. `@Inject()` must be re-applied on every new file created during folder rename

Renaming a folder by deleting old files and creating new ones is the #1 trigger for `@Inject()` omission. The existing corrected files carry the decorator — newly created files do not inherit it. NestJS starts without error; the crash happens only on the first request (HTTP 500, `Cannot read properties of undefined`).

**Grep to audit after any rename:**

```bash
grep -n "@Injectable" src/**/*.ts
```

Then manually verify every constructor parameter in each result has `@Inject(Token)`.

### 4. `.ts` extension in imports: do NOT include it (contradicts one earlier doc)

`docs/learned/layer-architecture-refactor-execution.md` (2026-03-27) originally stated `.ts` was required because `tsx` runs source directly. That guidance was wrong. The linter enforces no-extension imports — 16 files had `.ts` removed in this session. The runtime accepts both; the linter rejects the extension form.

`docs/learned/import-path-correction-after-refactor.md` is now the authoritative reference.

### 5. Deleted providers must be removed from `*.module.ts` — NestJS doesn't warn

When `IssueEventService` was deleted, it remained in `linear-webhook.module.ts`. NestJS only throws at startup with a cryptic dependency resolution error. There is no lint or compile-time guard. Always grep after any class deletion:

```bash
grep -r "DeletedClassName" src/**/*.module.ts
```

### 6. Dockerfile company email was hardcoded

`Dockerfile` had `git config --global user.email "claude-agent@jitera.com"`. This was changed to `claude-agent@example.com`. The email is used for commits made by the Claude agent inside the container. If deploying to a new environment, verify this does not contain an internal company address.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/GEN-002-project-folder-structure.md` — canonical folder placement rules; check before placing any new file.
- `oxlint.config.js` — review `overrides` array; every top-level directory needs its own entry if `no-relative-import-paths` must apply.
- `docs/learned/import-path-correction-after-refactor.md` — full alias mapping table (old vs. new paths after the refactor).
- `docs/learned/inject-decorator-omission-in-refactor.md` — explains why `@Inject()` keeps being missed on newly created files.
- Run `npm run lint && npm run test` immediately after any folder rename — do not wait until the full refactor is "done".
