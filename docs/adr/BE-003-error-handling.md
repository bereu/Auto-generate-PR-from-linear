---
id: BE-003
title: Error-handling
domain: backend
rules: false
---

# Error-handling-with-Rollbar

## Context

We need to establish a consistent pattern for error handling across the application and define a structured way to report these errors to our monitoring service, Rollbar. We primarily encounter two distinct types of errors:

1. **Business Logic Errors**: These are errors where an action is impossible within the valid business workflow. For example: A non-existent user attempting to create a project or a todo item.
2. **System Errors**: These are unexpected technical failures, such as 500 Internal Server errors, type errors, database connection failures, etc.

Both types of errors need to be handled appropriately and monitored to ensure system reliability and a good user experience.

## Decision

1. We must explicitly manage error handling throughout the application, categorizing errors as either **Business Logic Errors** or **System Errors**.
2. When an error is handled, we will send an error report to Rollbar.
3. Every Rollbar error report must include relevant **properties** (e.g., user ID, resource ID, action attempted) that provide sufficient context for debugging.

## Do's and Don'ts

### Do

- Do attach relevant contextual properties when sending errors to Rollbar (e.g., parameters, state, or user identifiers).
- Do distinguish between business logic errors (which might be expected under certain bad inputs) and system errors.
- Do create and use custom error classes to represent specific business logic failures.

### Don't

- Don't send sensitive user information (PII, passwords, tokens) in the properties sent to Rollbar.
- Don't swallow generic system errors without logging them to Rollbar.
- Don't let business logic errors trigger unhandled exception crashes.

## Consequences

### Positive

- Faster debugging and issue resolution due to property-rich error logs in Rollbar.
- Clear separation between expected workflow violations (business logic) and unexpected bugs (system errors).
- Better visibility into the overall health and user-facing issues of the application.

### Negative

- Slightly more verbose code to ensure properties are properly caught and passed to Rollbar.
- Increased dependency on the external Rollbar service for error monitoring.

### Risks

- Accidental leakage of sensitive user data if error properties are not carefully sanitized before being sent to Rollbar.
- Potential to overwhelm Rollbar quotas if business logic errors are triggered excessively by malicious or buggy clients.

## Compliance and Enforcement

- Code reviews will strictly check that appropriate context and properties are passed when logging errors to Rollbar.
- Custom error abstractions will be provided to make logging property-rich business logic and system errors the path of least resistance.

## References

- [Rollbar JavaScript Documentation](https://docs.rollbar.com/docs/javascript)
