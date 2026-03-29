---
id: BE-001
title: Layer Architecture of BE
domain: backend
rules: false
files: ["server/src/**"]
---

## Context

To maintain high code quality, reduce the introduction of bugs, and ensure the codebase remains easy to modify as the project grows, we need a clear and consistent backend architectural pattern. This ADR defines the "Lauer" layered architecture, its access rules, and data structures.

## Decision

We adopt a layered architecture with CQRS (Command Query Responsibility Segregation) principles. The architecture is divided into the following layers and data structures:

### Layer rules

```mermaid
sequenceDiagram
    autonumber
    participant Client
    participant Ctrl as 1. Controller
    participant Coord as 2. Coordinator
    participant Logic as 3. Query / 4. Command
    participant Repo as 5. Repository
    participant DS as 6. DataSource
    participant Transfer as 7. Transfer
    participant DB as RDB
    participant ES as ExternalService

    Client->>Ctrl: API Request
    Note over Ctrl: Map to Request DTO<br/>(API Validation)

    Note over Ctrl,Logic: Coordinator orchestrates Command and Query.<br/>If business logic is only a single Command or Query,<br/>Controller can access them directly.
    alt Orchestrated Flow (Multiple operations)
        Ctrl->>Coord: Passes DTO or Domain
        Coord->>Logic: Passes DTO, Domain, or Params
    else Direct Flow (Single operation)
        Ctrl->>Logic: Passes DTO, Domain, or Params
    end

    Note over Logic: Execute Business Logic<br/>& Domain Validation

    Logic->>Repo: Passes Domain (Write) or Params (Read)
    alt Access RDB
        Repo->>DS: Passes DataModel or Params
        DS->>DB: Accesses Database (RDB)
        DB-->>DS: Returns Raw Data
        DS-->>Repo: Returns DataModel
    else Access External Service
        Repo->>Transfer: Passes DataModel or Params
        Transfer->>ES: Accesses External Service
        ES-->>Transfer: Returns Raw Data
        Transfer-->>Repo: Returns DataModel
    end
    Note over Repo: Reconstructs Domain Object
    Repo-->>Logic: Returns Domain

    alt Orchestrated Flow (Multiple operations)
        Logic-->>Coord: Always returns Domain
        Coord-->>Ctrl: Returns Domain
    else Direct Flow (Single operation)
        Logic-->>Ctrl: Always returns Domain
    end

    Note over Ctrl: Converts Domain to Response DTO
    Ctrl-->>Client: API Response (DTO)
```

### Data Structures & Validation

- **DTO (Data Transfer Object)**:
  - Used in the **Controller** layer.
- **Domain**:
  READ `adr/BE-002-manage-data-domain.md`

### Access Rules

1.  **Controller**: Entry point. Accesses Coordinator, Query, and Command. Uses DTOs for request handling and is responsible for converting returned Domain objects into Response DTOs.
2.  **Coordinator** (Read/Write): Orchestrates complex flows. Uses Domain objects. The coordinator's sole purpose is the **orchestration** of commands and queries. It must not be used if no orchestration is needed (e.g., merely wrapping a single command or query).
    - **Bad** (Just a wrapper, no orchestration):
      ```typescript
      class TodoCoordinator {
        findAll() {
          return this.todoQuery.findAll(); // It is just a wrapper, not orchestrating.
        }
      }
      ```
    - **Good** (Orchestrates multiple operations, e.g., Query then Command):
      ```typescript
      class ReservationCoordinator {
        async reserve(id: string) {
          const user = await this.userRepository.findById(id);
          await this.scheduleRepository.reserve(user, "YYYYMMDD"); // Includes Query and Command. It is OK.
        }
      }
      ```
3.  **Query** (Read-only): Data retrieval.
4.  **Command** (Write-only): Data modification.
5.  **Repository**: Aggregates data for domain-unit access. Accesses DataSource and Transfer.
6.  **DataSource**: 1:1 mapping to database tables (RDB).
7.  **Transfer**: Wrapper for accessing external services (e.g., Firebase, third-party APIs). It is accessed by the Repository layer and handles the communication and data mapping to/from external services.

### Naming Convention

We prioritize naming that reflects **business logic** and domain language over technical implementation details.

- **Good**: `reserveSchedules`, `calculateShippingFee`, `cancelOrder`
- **Avoid**: `addReservation`, `getShippingTotal`, `deleteOrderEntry`

## Do's and Don'ts

### Do

- Use **DTOs** for all external API request mapping.
- Place strict business validation logic inside **Domain** classes.
- Use the **Query** layer for all read-only logic.
- Use the **Command** layer for all write/modification logic.
- **Always return Domain objects** from both Query and Command layers.
- Keep each function small with a single responsibility.

### Don't

- Perform business logic validation in the DTO or Controller.
- Access the **DataSource**, **Repository**, or **Transfer** directly from the **Controller**.
- Access the RDB from any layer other than **Repository** or **DataSource**.
- Perform write operations within the **Query** layer.

## Consequences

### Positive

- Stronger data integrity due to validation at both API (DTO) and Business (Domain) levels.
- Code matches business language, improving clarity.
- Small function responsibility leads to easier maintenance and fewer bugs.
- Clear separation of concerns for internal RDB access and external service integration.

### Negative

- Increased boilerplate code (mapping between DTO, Domain, DataModel, and external service models).

### Risks

- Over-engineering for simple CRUD operations.

## Compliance and Enforcement

This decision will be enforced through architectural reviews and automated linting.

## References

- CQRS Pattern
- Domain-Driven Design (Validation)
- Clean Architecture
