---
id: BE-004
title: Test-for-bussiness-logic
domain: backend
rules: true
---

# Test-for-bussiness-logic

## Context

To ensure the reliability and correctness of our application, we must have an automated way to verify our business logic. As the application scales, manual testing becomes prone to human error and inefficiency. The core logic of our backend resides primarily in three layers: coordinator, query, and command. We need a definitive standard for testing these layers.

## Decision

1. We must write unit tests for all business logic.
2. Specifically, comprehensive unit tests are strictly required for the following backend layers:
   - **Coordinator** Layer
   - **Query** Layer
   - **Command** Layer
3. We write test files to `server/test`.

## Do's and Don'ts

### Do

- Do write unit tests **ONLY** for: **Coordinator**, **Query**, and **Command** layers.
- Do write unit tests that cover the core behavior, edge cases, and expected failures within these three layers.
- Do use descriptive test names that clearly explain the business rule being verified.
- Do integrate test files in `server/test` directory alongside the layer files.

### Don't

- **Don't write test files for any other layers** (Repository, DataSource, Transfer, etc.). Tests are ONLY for Coordinator, Query, and Command.
- Don't skip writing unit tests for business logic under the pretext of deadline pressure.
- Don't tightly couple unit tests to implementation details; focus on testing inputs and expected outputs/behavior.
- Don't mock bottom layer. ex: when testing Query, Repository should not be mocked.
- Don't create test files for infrastructure or data access layers.

## Consequences

### Positive

- Higher confidence in the correctness of business rules.
- Fewer regressions introduced during refactoring or adding new features.
- Tests serve as living documentation for how the coordinator, query, and command layers are expected to behave.

### Negative

- Increased initial development time required to design and write the unit tests.
- Ongoing maintenance cost to keep tests updated as business requirements change.

### Risks

- Flaky tests if external dependencies or asynchronous operations are not mocked correctly.
- False sense of security if unit tests only cover "happy paths" and lack coverage for critical edge cases.

## Compliance and Enforcement

- Code reviews must verify that any new or modified business logic in the coordinator, query, or command layers is accompanied by appropriate unit tests.
- CI/CD pipelines will enforce code coverage metrics and block merges if tests are failing.

## References

- [Vitest / Jest Documentation (or relevant testing framework)]
