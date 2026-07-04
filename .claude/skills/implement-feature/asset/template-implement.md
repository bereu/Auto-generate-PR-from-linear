```markdown
# Example: Running implement-feature

## Invocation

The user runs:
```

/implement-feature

```

or with a specific plan:

```

/implement-feature rate-limiter.md

````

---

## What the skill does

Given an active execution plan like `docs/exec-plans/active/rate-limiter.md`:

```markdown
# Agent Execution Plan: Add Rate Limiter to Scheduler

## 1. Plan Overview
Add a token-bucket rate limiter to the scheduler to prevent runaway session spawning.

## 2. Why It Is Needed
Under load, sessions are spawned faster than the system can manage, causing OOM crashes.

## 3. Action List
- [ ] Add `RateLimiter` class to `src/scheduler/rate-limiter.ts`
- [ ] Integrate `RateLimiter` into `src/scheduler/index.ts` before `spawnSession`
- [ ] Add unit tests in `tests/unit/scheduler/rate-limiter.test.ts`

## 4. AC (Acceptance Criteria)
- [ ] Spawning more sessions than the configured limit is rejected with a Result<Err>
- [ ] Unit tests cover the happy path and the rate-exceeded path
- [ ] No existing scheduler tests are broken
````

The skill will:

1. Read the plan and orient in the codebase via `docs/INDEX.md`
2. Read `src/scheduler/index.ts` and related files before writing code
3. Implement `RateLimiter`, integrate it, write tests — checking off each action item
4. Run tests to verify AC, check off each criterion
5. Move the plan to `docs/exec-plans/completed/rate-limiter.md`

```

```
