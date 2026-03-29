# What I Learned: `@Inject()` Omission Recurs in New Files During Refactors

**Date:** 2026-03-27

## What I Learned This Session

### The `@Inject()` rule gets missed when creating new Injectable files from scratch

The rule "always use `@Inject(Token)` explicitly in NestJS constructors under tsx/esbuild" is documented in `nestjs-tsx-esbuild-decorator-setup.md`. Despite this, the same bug reappeared during the `src/webhook/` → `src/linear-webhook/` rename.

**Why it recurred:** The existing files that had the bug fixed previously already contained `@Inject()`. When the folder was renamed, new files were created from scratch — and the rule was not applied to the fresh file. The bug only surfaced during E2E testing as an HTTP 500 on every webhook call.

**The failure scenario:**

```typescript
// NEW file created during rename — @Inject omitted:
@Injectable()
export class IssueEventService {
  constructor(
    private readonly implementIssue: ImplementIssueCommand, // ❌ missing @Inject
  ) {}
}
```

```typescript
// Correct — what it should have been:
@Injectable()
export class IssueEventService {
  constructor(
    @Inject(ImplementIssueCommand) private readonly implementIssue: ImplementIssueCommand, // ✅
  ) {}
}
```

Without `@Inject(ImplementIssueCommand)`, `implementIssue` is `undefined` at runtime. NestJS emits no error at startup — the failure only appears when a method on the service is called.

### Risk pattern: new file creation during rename/refactor

- **Editing an existing file:** safe — the `@Inject()` is already there.
- **Creating a new file from scratch:** high risk — the rule must be consciously re-applied; it is not inherited from a template.

Renaming a folder by deleting old files and creating new ones is the #1 trigger for this bug in this project.

### Code review checklist item

When reviewing any new `@Injectable()` class, verify every constructor parameter has `@Inject(Token)`. There is no linting rule for this — it is a manual review gate.

### Minor: inline comment in entry file had stale script name

`src/main.dev.ts` had a comment saying `Run: npm run start:dev`. The correct script is `npm run dev:server`. When scripts are renamed in `package.json`, inline file comments are not updated automatically — they must be grep-found and fixed manually.

## What a New Team Member Should Know

- When you **rename a folder** by creating new files: immediately check every `@Injectable()` class in the new files for `@Inject()` on each constructor parameter.
- The symptom of a missing `@Inject()` is an HTTP 500 with a TypeError like `Cannot read properties of undefined` at runtime. NestJS startup succeeds; the crash happens on the first real request.
- Grep for `@Injectable` → check each constructor for `@Inject` on every parameter. If any parameter lacks `@Inject(Token)`, add it.

## Docs & Info That Would Speed Things Up Next Time

- `docs/learned/nestjs-tsx-esbuild-decorator-setup.md` — explains why tsx/esbuild requires explicit `@Inject()` (no `emitDecoratorMetadata`).
- `src/linear-webhook/linear-webhook.service.ts` — current reference: `@Inject(ImplementIssueCommand)` on line 13.
- Grep command to audit: `grep -n "@Injectable" src/**/*.ts` then check each file's constructor for `@Inject`.
