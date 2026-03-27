---
id: BE-002
title: domain rules
domain: backend
rules: true
---

# Domain Rules

## Context

To minimize side effects, ensure data integrity, and prevent bugs across the backend, we need a strict set of rules for how Domain classes are implemented. This ADR defines the structural and behavioral requirements for all domain-related objects.

## Decision

All Domain classes must adhere to the following foundational rules to remain immutable and self-validating:

### General Implementation Rules

1.  **Immutability (Getters Only)**: Domain classes must only provide `getter` methods. Properties must be private or read-only to ensure no side effects after instantiation.
2.  **Complete Constructors**: The constructor must require all properties necessary for a valid domain object. Partial or empty domain objects are not allowed.
3.  **Self-Validation**: Validation logic must be executed within the **constructor**. If any value is invalid, the constructor must throw an error, ensuring that an invalid domain object can never exist in memory.
4.  **Derivation Methods**: Domains can have methods for calculations or combining data (e.g., `user.fullName() => user.firstName + user.lastName`).

## example

```typescript
import { TodoId } from "@/todos/domain/todo-id";
import { TodoTitle } from "@/todos/domain/todo-title";

export const VALID_STATUSES = ["todo", "in-progress", "done"] as const;
export type TodoStatus = (typeof VALID_STATUSES)[number];

const DEFAULT_STATUS: TodoStatus = "todo";

export class Todo {
  private constructor(
    private readonly _id: TodoId,
    private readonly _title: TodoTitle,
    private readonly _description: string | null,
    private readonly _completed: boolean,
    private readonly _createdAt: Date,
    private readonly _status: TodoStatus,
  ) {}

  static create(
    title: string,
    description?: string | null,
    id?: string,
    status?: TodoStatus,
  ): Todo {
    const todoId = TodoId.create(id);
    const todoTitle = TodoTitle.create(title);
    const validatedStatus = this.validateStatus(status || DEFAULT_STATUS);

    return new Todo(todoId, todoTitle, description || null, false, new Date(), validatedStatus);
  }

  static reconstruct(
    id: string,
    title: string,
    description: string | null,
    completed: boolean,
    createdAt: Date,
    status?: TodoStatus,
  ): Todo {
    const todoId = TodoId.of(id);
    const todoTitle = TodoTitle.create(title);
    const validatedStatus = this.validateStatus(status || DEFAULT_STATUS);

    return new Todo(todoId, todoTitle, description, completed, createdAt, validatedStatus);
  }

  id(): TodoId {
    return this._id;
  }

  title(): TodoTitle {
    return this._title;
  }

  description(): string | null {
    return this._description;
  }

  completed(): boolean {
    return this._completed;
  }

  createdAt(): Date {
    return this._createdAt;
  }

  status(): TodoStatus {
    return this._status;
  }

  private static validateStatus(status: string): TodoStatus {
    if (!VALID_STATUSES.includes(status as TodoStatus)) {
      throw new Error(`Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(", ")}`);
    }
    return status as TodoStatus;
  }
}
```

## Do's and Don'ts

### Do

- Throw errors in the constructor if input values violate business rules.
- Use private fields with public getters for all properties.
- Implement descriptive methods for calculated values rather than letting consumers calculate them.

### Don't

- Use setters (`set propertyName`) in any domain class.
- Return raw database types from a domain; always wrap them in domain logic.
- Perform asynchronous operations (e.g., DB calls) inside a domain constructor or method.

## Consequences

### Positive

- **No Side Effects**: Immutable objects prevent accidental state changes during execution.
- **Guaranteed Validity**: Once you have a domain object, you know it is valid, reducing null/type checks elsewhere.
- **Domain Clarity**: Business logic is localized within the domain itself.

### Negative

- **Verbose Initialization**: Constructors can become large when many properties are required.
- **Mapping Overhead**: Requires more mapping logic when converting from DataSources or DTOs.

## Compliance and Enforcement

Enforced through peer reviews and strict TypeScript typing (e.g., using `Readonly` interfaces).

## References

- Domain-Driven Design (DDD)
- Value Object Pattern
- Immutability in Software Design
