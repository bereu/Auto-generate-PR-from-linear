# Test Plan: Fix Lint Violations

## 1. Overview

### 1.1 Test Objectives

- Validate that all refactored functions maintain identical behavior to originals
- Confirm all 20 lint violations are resolved
- Ensure no new violations are introduced
- Verify all existing tests continue to pass
- Validate code quality improvements through linting

### 1.2 Test Scope

**In scope:**

- Unit test execution for all affected modules
- Integration tests for agent processing flows
- Lint validation (oxlint + archgate rules)
- Code coverage verification (no degradation)
- Manual code review for functional equivalence

**Out of scope:**

- Performance benchmarking (not part of lint fixes)
- Adding new unit tests for refactored functions (maintain existing test coverage)
- Changes to test assertions or expectations
- UI/E2E testing (backend refactoring only)

---

## 2. Test Strategy

### 2.1 Test Levels

#### 2.1.1 Unit Tests

**Target modules:**

- `src/agent.ts` - `processIssue()`, `runClaude()`
- `src/transfer/github.transfer.ts` - `fetchPrUrl()`
- `src/linear-webhook/command/implement-issue.command.ts` - `implement()`
- `src/slack-bug-intake/coordinator/slack-bot.coordinator.ts` - `handleIncoming()`

**Key cases:**

- Happy path: All functions execute and return expected results
- Error handling: All error cases are still caught and handled
- State changes: All side effects (e.g., Linear issue updates) occur correctly
- Async operations: All promises resolve/reject correctly

**Edge cases:**

- Empty or null inputs
- Partial failures (e.g., GitHub API fails but Linear updates succeed)
- Multiple retry scenarios
- Timeout scenarios

#### 2.1.2 Integration Tests

- [ ] Agent processing: Issue → Linear → Claude → GitHub → Linear (full flow)
- [ ] Slack triage: Message → evaluate → clarify → create issue
- [ ] Error propagation: Verify errors bubble up correctly through refactored call chain

#### 2.1.3 Linting Tests

- [ ] oxlint: `npx oxlint src --config .oxlintrc.json` returns 0 violations
- [ ] archgate: `pnpm archgate check` returns 0 violations
- [ ] typescript: `npx tsc --noEmit` returns 0 type errors
- [ ] build: `npm run build` completes successfully

#### 2.1.4 Code Quality Tests

- [ ] No new complexity violations (all functions ≤ complexity 5)
- [ ] No new max-lines violations (all functions ≤ 30 lines)
- [ ] No new max-params violations (all functions ≤ 8 parameters)
- [ ] No new unused variable violations
- [ ] Test code cleanup: test describe blocks ≤ 30 lines

---

## 3. Test Design

### 3.1 Test Scenarios

#### Scenario 1: Lint Validation - All Violations Resolved

- [ ] Test Scenario 1
  - GIVEN: Refactored code with new lint rules active
  - WHEN: Running `npx oxlint src --config .oxlintrc.json`
  - THEN: Zero violations reported; exit code 0

#### Scenario 2: Unit Tests - All Tests Pass

- [ ] Test Scenario 2
  - GIVEN: All refactored functions in place
  - WHEN: Running `npm run test`
  - THEN: All unit tests pass; no test failures introduced

#### Scenario 3: Integration Test - Full Agent Flow

- [ ] Test Scenario 3
  - GIVEN: Mock Linear issue with agent label and todo state
  - WHEN: `processIssue()` is called with the issue
  - THEN:
    - GitHub transfer is invoked correctly
    - Claude agent receives correct parameters
    - Linear issue state updates occur as expected
    - All error handling paths work (Claude errors, GitHub errors, etc.)

#### Scenario 4: Integration Test - Slack Triage

- [ ] Test Scenario 4
  - GIVEN: Slack message in bug-triage channel
  - WHEN: `handleIncoming()` processes the message thread
  - THEN:
    - Bug report is evaluated correctly
    - Clarifying questions are posted if incomplete
    - Linear issue is created when complete
    - Thread is unsubscribed appropriately

#### Scenario 5: Error Handling - processIssue Errors

- [ ] Test Scenario 5
  - GIVEN: Various error scenarios (GitHub API down, Claude timeout, Linear auth failure)
  - WHEN: `processIssue()` encounters each error
  - THEN: Errors are logged and issue state is updated to suspended (as per original behavior)

#### Scenario 6: Error Handling - runClaude Errors

- [ ] Test Scenario 6
  - GIVEN: Claude agent fails with various errors (MaxTurnsReachedError, ClaudeTerminatedError, etc.)
  - WHEN: `runClaude()` handles each error type
  - THEN: Appropriate Linear issue state updates and comment additions occur

#### Scenario 7: GitHub Transfer - fetchPrUrl

- [ ] Test Scenario 7
  - GIVEN: Various GitHub scenarios (PR exists, no PR, invalid repo)
  - WHEN: `fetchPrUrl(repoFullName, branch)` is called
  - THEN: Returns correct PR URL or null, handles errors correctly

#### Scenario 8: Code Quality - No Coverage Degradation

- [ ] Test Scenario 8
  - GIVEN: Refactored code with new extracted helper functions
  - WHEN: Test coverage is measured
  - THEN: Coverage percentages remain at or above baseline (no coverage drop)

### 3.2 Test Data

**Mock/Fixture data:**

- Sample Linear issues (various labels, states, fields)
- Sample Slack messages (complete and incomplete bug reports)
- Sample GitHub repo responses
- Sample Claude agent responses (success and error cases)

**Test fixtures location:**

- `server/test/fixtures/` - Shared test data
- Individual test files - Inline mocks and vi.mock()

**Data anonymization:**

- All test data is synthetic/mock
- No real user data or API keys in tests
- Environment variables loaded from `.env.test`

---

## 4. Environments & Tools

**Test environments:**

- Local development: `npm run test`
- CI: GitHub Actions (if configured)

**Tools & Frameworks:**

- Unit testing: Vitest
- Mocking: vi.mock() / vi.fn()
- Code quality: oxlint, typescript compiler, archgate

**Monitoring/Logging:**

- Test output: stdout from `npm run test`
- Lint output: stdout from `npm run lint`
- Coverage: Generated in `coverage/` directory

---

## 5. Entry & Exit Criteria

### 5.1 Entry Criteria

- [ ] Implementation plan (IMPLEMENTATION.md) is reviewed and approved
- [ ] All refactoring tasks are complete and code is ready for testing
- [ ] Development environment is set up with all dependencies
- [ ] Git branch is up-to-date with main

### 5.2 Exit Criteria

- [ ] All unit tests pass (100% pass rate)
- [ ] All integration tests pass
- [ ] Lint check passes: `npm run lint` → exit 0
- [ ] All 20 violations resolved: `npx oxlint src` → 0 violations
- [ ] Archgate compliance maintained: `pnpm archgate check` → 11/11 pass
- [ ] TypeScript type check passes: `npx tsc --noEmit` → 0 errors
- [ ] Build succeeds: `npm run build` → success
- [ ] Code review approved (functional equivalence confirmed)
- [ ] No new violations introduced
- [ ] Code coverage maintained at baseline or higher

---

## 6. Execution Checklist

### Pre-Testing

- [ ] Read IMPLEMENTATION.md to understand all changes
- [ ] Review refactored functions for logic correctness
- [ ] Verify all extracted helper functions are correct

### Testing Phase

- [ ] Run unit tests: `npm run test`
  - Document any failures and investigate
  - Fix any issues discovered
- [ ] Run lint checks: `npm run lint`
  - Verify all 20 violations resolved
  - Check no new violations introduced
- [ ] Run archgate checks: `pnpm archgate check`
  - Verify all ADR rules still pass
- [ ] Run build: `npm run build`
  - Verify TypeScript compilation succeeds
  - Verify no type errors introduced

### Post-Testing

- [ ] Collect results and create summary
- [ ] Document any issues/edge cases discovered
- [ ] Approve refactoring for merge
