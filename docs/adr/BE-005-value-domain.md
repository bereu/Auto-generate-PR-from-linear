---
id: BE-005
title: value domain rules
domain: backend
rules: true
---

# Value Domain Rules

## Context

In many cases, domain objects represent single, atomic values like IDs, Statuses, or Email Addresses. These are categorized as **Value Domains**.

## Decision

Value Domains wrap a single primitive or specific value to represent domain-specific primitives.

### Implementation Rules

- **Property**: The internal value must always be stored in a private property named `_value`.
- **Access**: Access the raw value via a `.value()` getter method.
- **Self-Validation**: Must validate the single value within the constructor.

### Example

```typescript
import { randomUUID } from "crypto";
import { InvalidTodoIdException } from "@/todos/domain/exceptions/todo-domain.exception";

export class TodoId {
  private constructor(private readonly _value: string) {}

  static create(id?: string): TodoId {
    const uuid = id || randomUUID();
    return new TodoId(uuid);
  }

  static of(id: string): TodoId {
    if (!id || typeof id !== "string") {
      throw new InvalidTodoIdException("must be a non-empty string");
    }
    return new TodoId(id);
  }

  value(): string {
    return this._value;
  }

  equals(other: TodoId): boolean {
    return this._value === other._value;
  }
}
```

## Do's and Don'ts

### Do

- Create specific Value Domains for important identifiers (e.g., `OrderId`, `EmailAddress`).
- Ensure the inner value is fully validated on construction.

### Don't

- Use generic primitive types (string, number) for business-critical identifiers; always wrap them in a Value Domain.
- Expose the inner value directly; use the `.value()` getter.

## Consequences

### Positive

- **Type Safety**: Prevents passing a raw string where a specific ID type is expected.
- **Centralized Validation**: Validation rules for specific primitives (like email format) are centralized.

## Compliance and Enforcement

Enforced through peer reviews and strict TypeScript typing.
