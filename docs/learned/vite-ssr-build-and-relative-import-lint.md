# What I Learned: Vite SSR Build Configuration and Relative Import Lint Rules

**Date:** 2026-03-28

## What I Learned This Session

### 1. `vp build` requires `build.ssr` to avoid treating Node.js entry as a browser bundle

The project uses `vite-plus` (`vp`), which wraps Vite. When adding a `build` script (`vp build`), simply omitting `build.ssr` causes Vite to bundle for the browser — this is wrong for a NestJS/Node.js server. Native Node modules get wrongly externalized or bundled for the wrong target.

The required config in `vite.config.ts`:

```ts
build: {
  ssr: "src/main.ts",   // tells Vite this is a Node.js SSR build, entry point
  outDir: "dist",
  target: "node22",     // matches the runtime Node version
},
```

**Why this matters:** Without `ssr: "src/main.ts"`, Vite treats the output as a browser bundle. NestJS decorators and reflect-metadata would not work correctly, and native Node APIs would be unavailable.

### 2. The build step (`vp build`) runs the linter and enforces `no-relative-import-paths`

Before this session, relative imports like `./foo` and `../foo` existed in entry-point and module files. The linter rule `no-relative-import-paths` (via `eslint-plugin-no-relative-import-paths`) treats any relative import as a violation. This rule is enforced at build time, so `vp build` fails until all relative imports are rewritten as alias imports.

Files affected (7 violations fixed):

- `src/main.ts`
- `src/main.dev.ts`
- `src/main.local.ts`
- `src/create-app.ts`
- `src/app.module.ts`
- `src/linear-webhook/linear-webhook.module.ts`

**Pattern:** `./foo` → `@/foo`, `../bar/baz` → `@/bar/baz`

Example:

```ts
// Before (violates lint)
import { createApp } from "./create-app";
import { AppModule } from "./app.module";

// After (correct)
import { createApp } from "@/create-app";
import { AppModule } from "@/app.module";
```

**Why this rule exists in this project:** Enforcing alias imports keeps import paths stable across folder refactors. Relative paths break silently when files are moved; alias paths catch the error immediately at lint time.

### 3. `vp build` output is `dist/main.js` (~18KB, single file)

The build bundles everything into a single SSR output file. This is expected behavior for `vite-plus` with `ssr` mode — it does not split chunks the same way a browser build would.

## Docs & Info That Would Speed Things Up Next Time

- `vite.config.ts` — always set `build.ssr`, `build.target`, and `build.outDir` when adding a build step for a Node.js app using `vite-plus`.
- `.oxlintrc.json` / `oxlint.config.js` — check here to understand which lint rules are active at build time.
- `eslint-plugin-no-relative-import-paths` — any new file with relative imports will fail `vp build`. Always use `@/` aliases.
- Run `npm run lint` before `npm run build` to catch violations early without waiting for the full build pipeline.
