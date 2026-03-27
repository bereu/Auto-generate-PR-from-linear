# Harness for Todo App - Claude Code Context

# Command

    npm run start": "vp exec tsx --env-file=.env src/main.ts
    npm run start:dev": "vp exec tsx --env-file=.env src/main.dev.ts
    npm run dev:local": "vp exec tsx --env-file=.env src/main.local.ts
    npm run preview": "vp preview
    npm run prepare": "husky
    npm run test": "vp test run
    npm run lint": "vp check --fix && vp lint && pnpm run lint:duplicates

## Architecture & Decisions

All architectural decisions are documented as ADRs (Architecture Decision Records) in `docs/adr/` (symlinked from `.archgate/adrs/`)

## plan

- we have information `docs/tasks`

## step

When you implement feature. Please follow below steps.

1. MUST plan your task (plan-spec skill)
2. MUST implement with below rules
   - MUST implement your task (implement-feature skill)
   - MUST review your code (use code-review skill)
   - MUST test (use qa-feature skill)
3. MUST complete and move to complete folder.
