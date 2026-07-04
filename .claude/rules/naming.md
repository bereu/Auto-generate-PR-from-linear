---
paths:
  - "*"
---

# Naming Conventions

## General Principles

- Names should describe what something is or does, not how it works.
- Use domain-specific terminology from the project glossary.
- Avoid abbreviations unless universally understood: `id`, `url`, `db`, `config` are fine. `usr`, `mgr`, `proc` are not.
- Be consistent. If the codebase uses `remove`, do not introduce `delete` for the same concept.
- Longer names for larger scopes. Single letters only for loop counters and lambdas.
