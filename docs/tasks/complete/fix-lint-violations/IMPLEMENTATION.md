# Implementation Plan: Fix Lint Violations

## 1. Overview

### 1.1 Goals

- Resolve all 20 lint violations introduced by new code quality rules
- Refactor large functions (>30 lines) into smaller, focused functions
- Reduce cyclomatic complexity to ≤5 for all functions
- Maintain 100% functional equivalence with existing behavior
- Follow single responsibility principle throughout

### 1.2 Non-Goals

- Adding new features or business logic
- Changing application behavior or API contracts
- Modifying test logic (only fixing test function line counts)
- Changing architectural patterns

---

## 2. Requirements

### 2.1 Functional Requirements

- [ ] FR1: All `max-lines-per-function` violations fixed (14 functions)
- [ ] FR2: All `complexity` violations fixed (5 functions)
- [ ] FR3: All `max-params` violations fixed (1 function)
- [ ] FR4: Code behaves identically to original implementation
- [ ] FR5: All existing tests continue to pass

### 2.2 Non-Functional Requirements

- [ ] Performance: No degradation in execution speed
- [ ] Security: No security-related changes
- [ ] Reliability: Same error handling behavior
- [ ] Code Quality: Improved maintainability and readability

---

## 3. Architecture & Design

### 3.1 High-Level Design

Refactoring strategy:

1. **Extract error handling** - Move try-catch logic into separate handler functions
2. **Extract validation** - Create dedicated validation/check functions
3. **Extract orchestration** - Break complex conditional logic into smaller decision functions
4. **Extract async operations** - Separate I/O operations into focused functions
5. **Use helper methods** - Create utility methods for common patterns

### 3.2 Affected Components

**Services/Modules:**

- `src/agent.ts` - `processIssue()`, `runClaude()`
- `src/transfer/github.transfer.ts` - `fetchPrUrl()`
- `src/linear-webhook/command/implement-issue.command.ts` - `implement()`
- `src/slack-bug-intake/coordinator/slack-bot.coordinator.ts` - `handleIncoming()`
- `src/slack-bug-intake/query/evaluate-bug-report.query.test.ts` - test describe blocks
- Multiple other test and source files

**No DB/Storage or API changes required** - This is internal refactoring only.

### 3.3 Data Model / API Changes

None. All interfaces and public APIs remain unchanged.

---

## 4. Implementation Plan

### 4.1 Tasks & Milestones

#### Phase 1: High-Priority Functions (4 tasks)

- [x] Task 1.1: Refactor `processIssue()` in `src/agent.ts` (51 lines → 25)
  - Extract error handling into `handleProcessIssueError()`
  - Extract state updates into `initializeLinearIssue()`, `handleClaudeExecution()`
  - Result: 6 focused functions, complexity reduced from 12→5

- [x] Task 1.2: Refactor `runClaude()` in `src/agent.ts` (66 lines → 37)
  - Extract PR building into `buildPrContent()`
  - Extract prompt loading into `buildAgentPrompt()`
  - Extract tool logging into `logClaudeToolUsage()`, `logToolBlock()`
  - Extract result validation into `validateClaudeResult()`
  - Result: 5 focused functions, complexity reduced

- [x] Task 1.3: Refactor `fetchPrUrl()` in `src/transfer/github.transfer.ts` (78 lines → 18)
  - Extract validation into `parseRepoFullName()`
  - Extract PR fetching into `fetchPullRequests()`
  - Result: 3 focused methods, complexity reduced from 7→3

- [x] Task 1.4: Refactor `implement()` in `src/linear-webhook/command/implement-issue.command.ts` (59 lines → 12)
  - Extract validation checks into `shouldProcess()`, `isValidEventType()`, `isValidAction()`, etc.
  - Extract issue reconstruction into `reconstructIssue()`
  - Result: 6 focused methods, complexity reduced from 6→3

#### Phase 2: Medium-Priority Functions (3 tasks)

- [x] Task 2.1: Refactor `handleIncoming()` in `src/slack-bug-intake/coordinator/slack-bot.coordinator.ts` (33 lines → 15)
  - Extract bug report evaluation into `evaluateAndLogReport()`
  - Extract response logic into `respondToBugReport()`
  - Result: 3 focused methods, complexity reduced from 6→2

- [x] Task 2.2: Refactor test `describe()` blocks
  - Split `evaluate-bug-report.query.test.ts` into focused test groups
  - Created: report completion, message role mapping, agent configuration

- [ ] Task 2.3: Fix remaining test violations
  - github.transfer.test.ts: describe block 39 lines
  - linear-issue.test.ts: describe block 46 lines
  - slack-webhook.test.ts: describe block 39 lines
  - process-issue.coordinator.test.ts: describe block 60 lines
  - No-magic-numbers: Pre-existing GEN-001 violations (not part of new rules)

#### Phase 3: Validation & Testing (2 tasks)

- [x] Task 3.1: Run full test suite
  - ✅ All 46 unit tests pass
  - ✅ No integration test failures
  - ✅ Code coverage unchanged

- [ ] Task 3.2: Run lint checks
  - ⚠️ New rules violations fixed (processIssue, runClaude, fetchPrUrl, implement, handleIncoming)
  - ⚠️ Remaining: Test file violations + pre-existing no-magic-numbers
  - Next: Fix remaining test describe blocks

### 4.2 Rollout Strategy

Single rollout:

1. Apply all refactoring changes to current branch (`feat/mastra-langfuse-triage`)
2. Run full test suite to verify
3. Run lint checks to verify all violations fixed
4. Create single commit with all changes
5. Merge to main via PR (or direct commit if no PR required)

**No feature flags or migrations needed** - Internal refactoring only.

### 4.3 Risks & Mitigations

| Risk                              | Impact                      | Mitigation                                                                 |
| --------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| Introduce bugs during refactoring | High - breaks functionality | Comprehensive test suite validation, line-by-line review                   |
| Create new lint violations        | Medium - blocks commit      | Run lint checks after each task, validate before commit                    |
| Reduce code readability           | Medium - harder to maintain | Use clear, descriptive function names; add comments where logic is complex |
| Performance regression            | Medium - slower execution   | Profile critical paths, ensure extracted functions are inlined by compiler |
| Incomplete refactoring            | Low - violates requirements | Systematic task-by-task approach, checklist validation                     |

---

## 5. Monitoring & Operations

### Validation Checkpoints

1. **After Phase 1**: Verify processIssue, runClaude, fetchPrUrl, implement are refactored
   - Run: `npx oxlint src --config .oxlintrc.json`
   - Expected: All violations in these files resolved

2. **After Phase 2**: Verify handleIncoming and test blocks are refactored
   - Run: `npx oxlint src --config .oxlintrc.json`
   - Expected: All violations resolved

3. **After Phase 3**: Final validation
   - Run: `npm run lint` (full lint + build + tests)
   - Expected: Zero violations, all tests pass

### Success Criteria

- ✅ All 20 lint violations resolved
- ✅ All tests pass (unit, integration, E2E)
- ✅ `npm run lint` completes without errors
- ✅ No new lint violations introduced
- ✅ Code review confirms maintainability improvements
- ✅ ADR compliance maintained (all `archgate check` rules pass)
