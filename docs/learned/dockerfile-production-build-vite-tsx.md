# What I Learned: Dockerfile Production Build with vite-plus and Node.js

**Date:** 2026-03-28

## What I Learned This Session

### 1. `vite.config.ts` imports config files at build time — they must be COPYed before `pnpm run build`

`vite.config.ts` contains:

```ts
import oxlintRules from "./.oxlintrc.json" with { type: "json" };
```

and the plugin config references `oxlint.config.js`. If these files are not present in the Docker layer when `RUN pnpm run build` executes, the build fails with a module-not-found error.

**Rule:** In the Dockerfile, always `COPY` all files that `vite.config.ts` references before running the build step:

```dockerfile
COPY tsconfig.json vite.config.ts oxlint.config.js .oxlintrc.json ./
COPY src/ ./src/
RUN pnpm run build
```

**Why it's easy to miss:** These are "config" files that feel optional, but `vite.config.ts` imports them statically. Forgetting them only fails at Docker build time, not locally (where they already exist).

### 2. `tsx` is a devDependency — it must not be used as the production CMD

The original Dockerfile CMD was:

```dockerfile
CMD ["pnpm", "exec", "tsx", "src/main.ts"]
```

`tsx` is listed as a devDependency. With `pnpm install --frozen-lockfile` (or a production-only install), `tsx` may not be reliably available. Even if it is installed, running TypeScript source directly in production is slower and skips the build validation step.

**Rule:** The production CMD must always use the compiled output:

```dockerfile
CMD ["node", "dist/main.js"]
```

This requires a `RUN pnpm run build` step before CMD. The build step is what makes the container self-contained and independent of TypeScript tooling.

**Why the original worked locally but is wrong:** Local Docker builds may have devDependencies installed in the node_modules layer cache, masking the issue.

### 3. The build step (`RUN pnpm run build`) also serves as a lint gate in Docker

Because `vp build` runs oxlint as part of the bundle process, any lint violation in `src/` will cause `docker build` to fail. This is useful: the Docker build doubles as a lint check. If `docker build` fails at `RUN pnpm run build`, check lint output first before assuming a missing dependency.

## Docs & Info That Would Speed Things Up Next Time

- `vite.config.ts` — check imports at the top; any file imported there must be in the Docker COPY list.
- `package.json` `devDependencies` — if a CLI tool appears here, it cannot be relied on in a production Docker CMD.
- `Dockerfile` line order: `COPY config files` → `COPY src/` → `RUN pnpm run build` → `CMD node dist/main.js` is the correct sequence.
