# Harness for Todo App - Claude Code Context

# Command

- npm run dev:local : Run local service for debug or QA
- npm run test : run test
- npm run lint : run lint
- npm run deploy : deploy to fly.io

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
