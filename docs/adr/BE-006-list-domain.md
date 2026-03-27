---
id: BE-006
title: list domain rules
domain: backend
rules: true
---

# List Domain Rules

## Context

When dealing with collections of domain objects, we need a consistent way to manage list-wide business logic, such as filtering, sorting, or orchestration.

## Decision

List Domains wrap a collection of other Domain objects to manage list-wide business logic.

### Implementation Rules

- **Property**: The main collection is held in a private `.list` property.
- **Logic**: Provides filtering or orchestration across the collection.
- **Immutability**: Operations that modify the collection must return a new instance of the List Domain.

### Example

```typescript
import { Todo } from "@/todos/domain/todo";

export class TodosList {
  private constructor(private readonly list: Todo[]) {
    if (!Array.isArray(list)) {
      throw new Error("TodosList must be initialized with an array");
    }
  }

  static create(todos: Todo[]): TodosList {
    return new TodosList(todos);
  }

  static empty(): TodosList {
    return new TodosList([]);
  }

  // Accessors
  getAll(): Todo[] {
    return [...this.list];
  }

  getCount(): number {
    return this.list.length;
  }

  isEmpty(): boolean {
    return this.list.length === 0;
  }

  // Derivation: Filter completed todos
  filterCompleted(): TodosList {
    return new TodosList(this.list.filter((todo) => todo.completed()));
  }

  // Derivation: Filter pending todos
  filterPending(): TodosList {
    return new TodosList(this.list.filter((todo) => !todo.completed()));
  }

  // Derivation: Get single todo by id or null
  findById(id: string): Todo | null {
    const found = this.list.find((todo) => todo.id().value() === id);
    return found || null;
  }
}
```

## Do's and Don'ts

### Do

- Use specific List Domains when logic applies to a group of entities.
- Implement filtering, sorting, and aggregation within the List Domain.

### Don't

- Mutate the inner collection directly.
- side effect function(add, update, remove)
- Return raw arrays if business logic needs to be applied to the collection.

## Consequences

### Positive

- **Clean Orchestration**: Logic for handling groups of entities is separated from single entity logic.
- **Consistent Interface**: Follows the same immutability and validation principles as single domain objects.

### Risks

- Potential performance impact if deep-validating extremely large lists (mitigated by efficient list domain logic).

## Compliance and Enforcement

Enforced through peer reviews and strict TypeScript typing.
