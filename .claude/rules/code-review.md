---
paths:
  - "*"
---

# Code Review

## Review Checklist

- Are there adequate tests? New logic needs new tests. Changed logic needs updated tests.
- Are error cases handled? Check for missing try/catch, unhandled promise rejections, and null checks.
- Is input validated at the boundary? API inputs, form data, and CLI args must be validated.
- Are there security concerns? SQL injection, XSS, hardcoded secrets, excessive permissions.
- Is the code readable without comments? Variable names, function names, and structure should be self-documenting.
- Are there performance concerns? N+1 queries, unbounded loops, missing pagination, large payloads.
- Does it follow project conventions? Naming, file structure, import order, error handling patterns.

## Reviewer Guidelines

- Review within 4 business hours of being tagged.
- Start with the PR description and linked issue to understand context.
- Read the full diff before leaving comments. Avoid reviewing file-by-file without context.
- Prefix comments with intent: `nit:`, `question:`, `suggestion:`, `blocker:`.
- Only `blocker:` comments prevent approval. Everything else is optional for the author.
- Suggest specific alternatives when requesting changes, not just "this is wrong."

## Automated Checks

- Lint and format checks in CI (ESLint, Prettier, Ruff, Clippy).
- Type checking in CI (TypeScript, mypy, pyright).
- Test suite with minimum coverage thresholds.
- Bundle size check for frontend changes.
- Migration safety check (no locking operations on large tables).
