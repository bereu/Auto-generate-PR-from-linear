# What I Learned: ADR Compliance — List Domain Side Effects

**Date:** 2026-03-27

## What I Learned This Session

### BE-006: List Domain must NOT contain side-effect methods

The `Don't` section of `BE-006` was updated this session to explicitly prohibit `add()`, `remove()`, and `update()` methods inside List Domain classes.

**The rule:** List Domains are read-only views of a collection. All mutations (add, remove, update) belong to the **Repository** layer, not the List Domain.

**Why it matters:** If List Domains expose mutation methods, they blur the boundary between the domain model and persistence logic. The Repository is the correct place to manage collection-level writes.

**Files that violated this rule in `harness-for-todo-app`:**

| File                                          | Violating Methods               |
| --------------------------------------------- | ------------------------------- |
| `server/src/todos/domain/todos-list.ts`       | `add()`, `remove()`, `update()` |
| `server/src/todos/domain/labels-list.ts`      | `add()`                         |
| `server/src/statuses/domain/statuses-list.ts` | `add()`                         |

None of these violating methods were called anywhere in the codebase at the time of discovery (verified by grep). This means they were dead code — but still ADR violations that must be removed.

### BE-001: Transfer layer is layer 7 for external services

`BE-001` was updated this session to add a **Transfer** layer (layer 7) between the Repository and external services (e.g., Firebase, third-party APIs). The Transfer layer is the only place that may communicate with external services; the Repository delegates to it.

For the current `harness-for-todo-app`, no external services exist, so no Transfer violations exist. But any future external service integration must introduce a Transfer class, not touch the DataSource directly.

### ADR compliance workflow: grep before assuming violations exist

When an ADR rule is added or updated, the workflow is:

1. Identify the rule change.
2. Grep the target codebase for the prohibited pattern (e.g., `add(` inside `*-list.ts`).
3. Check if any caller uses those methods — only then assess blast radius.
4. If methods are uncalled, removal is safe and a one-step refactor task.

This avoids over-scoping the task (e.g., assuming callers need updates when there are none).

## What a New Team Member Should Know

- **List Domain = read-only.** Never add `add()`, `remove()`, `update()` to a `*-list.ts` file. Those operations belong in the Repository.
- **The ADR example is authoritative.** The `TodosList` example in `BE-006` deliberately omits mutation methods. If your List Domain looks different from the example, treat that as a signal to audit it.
- **Transfer layer (BE-001 layer 7) is required for external services.** Do not call external APIs from DataSource or Repository directly.
- **Dead code in domain classes still violates ADRs.** Even if no callers exist, unused side-effect methods must be removed to comply with `BE-006`.

## Docs & Info That Would Speed Things Up Next Time

- `docs/adr/BE-006-list-domain.md` — Read the `Don't` section and the `TodosList` example carefully before writing any List Domain class.
- `docs/adr/BE-001-layer-architecture.md` — Read the Mermaid diagram and layer 7 (Transfer) description before adding any external service integration.
- Run `grep -r "add(" server/src/**/domain/*-list.ts` to quickly check for List Domain violations after any ADR update.
