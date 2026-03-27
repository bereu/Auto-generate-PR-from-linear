---
id: GEN-001
title: Magic Number and Status Management
domain: general
rules: true
files: ["**/*.ts", "**/*.tsx"]
---

# Magic Number and Status Management

## Context

Using "magic numbers" (literal numbers with no named context) or "magic strings" (literal strings representing states) directly in business logic leads to several issues:

- **Maintainability**: It's difficult to understand the meaning of a value like `0`, `1`, or `"active"` without searching for its definition.
- **Error-Prone**: Typos in strings (e.g., `"todo"` vs `"todo  "`) or incorrect numbers are not caught by the compiler.
- **Refactoring**: Changing a status value requires a global find-and-replace, which is risky and tedious.

To ensure consistency, type safety, and readability, we need a standard way to manage these values across the application.

## Decision

We prohibit the use of magic numbers and raw string literals for representing statuses or configuration values in business logic. instead, we must use **TypeScript Enums** or **Type Unions (String Literals)**.

### 1. Status Management (Recommended: Type Unions)

For statuses, we prefer **Type Unions** with a `const` array for validation and runtime access. This pattern is already widely used in the project.

**Example (Preferred):**

```typescript
// Define valid values in a const array
export const TODO_STATUSES = ["todo", "in-progress", "done"] as const;

// Derive the type from the array
export type TodoStatus = (typeof TODO_STATUSES)[number];

// Usage in business logic
const DEFAULT_STATUS: TodoStatus = "todo";

function updateStatus(status: TodoStatus) {
  if (!TODO_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  // ...
}
```

### 2. Magic Numbers (Recommended: Enums or Constants)

For fixed values or categories that are more naturally represented as numbers, use **Enums** or named **Constants**.

**Example (Enums):**

```typescript
export enum Priority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  URGENT = 3,
}

// Usage
const taskPriority = Priority.HIGH;
```

**Example (Constants):**

```typescript
export const MAX_RETRY_ATTEMPTS = 3;
export const DEFAULT_PAGE_SIZE = 20;
```

## Do's and Don'ts

### Do

- Define statuses in a central place within the relevant domain (e.g., `todo.ts`).
- Use `as const` for status arrays to ensure they are treated as literal types.
- Export both the type and the valid values array for runtime validation.
- Use descriptive names for enums and constants.

### Don't

- Use raw strings like `if (status === "done")` directly in components or services without refering to a type or constant.
- Use literal numbers like `if (retryCount > 3)` without a named constant explaining what `3` represents.

## Consequences

### Positive

- **Type Safety**: TypeScript will catch invalid status assignments at compile time.
- **Readability**: Code explicitly shows the intent (e.g., `TodoStatus` instead of `string`).
- **Maintainability**: Centralized definitions make it easy to add or rename statuses.
- **IDE Support**: Autocomplete works for all status values.

### Negative

- Slightly more boilerplate code to define the types and arrays.

## Compliance and Enforcement

- **Code Review**: Peers must flag any magic numbers or strings used for status/state.
- **Linting**: (Optional) Configure `no-magic-numbers` or custom rules to catch raw literals in business logic.
