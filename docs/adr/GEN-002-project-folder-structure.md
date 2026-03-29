---
id: GEN-002
title: Project Folder Structure
domain: general
rules: false
---

# Project Folder Structure

## Context

This ADR explains the project's folder structure within `src/` by directly mapping architectural layers, as defined in `BE-001-layer-architecture.md`, to their corresponding directories. This ensures consistent code placement and clarifies responsibilities across the codebase, including where tests are located.

## Decision

The `src/` directory is structured to align directly with the defined architectural layers and testing practices:

- **Controller Layer**: Files are placed in `src/<feature>/controller/` (e.g., `src/linear-webhook/controller/linear-webhook.controller.ts`).
- **Command Layer**: Files are placed in `src/<feature>/command/` (e.g., `src/linear-webhook/command/implement-issue.command.ts`).
- **Query Layer**: Files for read-only data retrieval are placed in `src/<feature>/query/` (e.g., `src/linear-webhook/query/get-issue.query.ts`).
- **Repository Layer**: Files are placed in `src/<feature>/repository/` (e.g., `src/linear-webhook/repository/issue.repository.ts`).
- **Transfer Layer**: Files are placed in `src/transfer/` (e.g., `src/transfer/linear.transfer.ts`).
- **Domain Layer**: Core domain entities and value objects are found in `src/domain/<feature>/` (e.g., `src/domain/issue/linear-issue.ts`).
- **Utility**: General helper functions are in `src/util/`.
- **Constants Layer**: Files are placed in `src/constants/`. This directory is used to manage static values such as permission tables, error messages, etc.
- **Testing**:
  - **Co-located Unit Tests**: Unit tests are typically placed alongside the code they test, using the `.test.ts` suffix (e.g., `src/domain/issue/linear-issue.test.ts`).
  - **Dedicated Test Folder**: The `src/test/` directory is reserved for broader tests such as integration tests, end-to-end tests, or shared test utilities that don't directly correspond to a single source file.

## Consequences

### Positive

- Clear mapping of architectural layers to physical directories.
- Improved consistency and easier navigation for developers.
- Reinforces separation of concerns.
- Clear guidelines for test file placement.

### Negative

- Requires strict adherence to placement rules.

## Compliance and Enforcement

Compliance is expected through code reviews.

## References

- `BE-001-layer-architecture.md`: Layer Architecture of BE
