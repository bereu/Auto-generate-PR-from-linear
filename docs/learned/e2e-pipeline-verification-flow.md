# What I Learned: E2E Pipeline Verification Flow

**Date:** 2026-03-27

## What I Learned This Session

### 1. `@Inject` rule is re-forgotten on every refactor of a NestJS service

`nestjs-tsx-esbuild-decorator-setup.md` already documents that `@Inject(Token)` must be explicit. But during this session's layer architecture refactor — when `WebhookService` was renamed to `IssueEventService` and the constructor parameter changed from `WebhookService` to `ImplementIssueCommand` — the `@Inject` annotation was dropped.

The result: `this.implementIssue` was `undefined` at runtime. NestJS gave no error during bootstrap. The failure only appeared when a real webhook hit triggered `this.implementIssue.implement(payload)`.

**The refactor checklist rule (not just a setup rule):**

Whenever you:

- Rename a `@Injectable()` class
- Change any constructor parameter type
- Copy a service to create a new one

…you must re-verify every constructor parameter has `@Inject(ConcreteClass)` explicitly:

```typescript
// Required every time — not just at initial creation
@Injectable()
export class IssueEventService {
  constructor(
    @Inject(ImplementIssueCommand) private readonly implementIssue: ImplementIssueCommand,
  ) {}
}
```

Without `@Inject`, tsx/esbuild silently injects `undefined`. There is no compile error. NestJS bootstrap succeeds. The bug only surfaces on the first method call.

### 2. Manual E2E verification procedure for the full pipeline

To verify the webhook → Linear → agent → PR pipeline end-to-end:

**Step 1: Start the server**

```bash
npm run dev:server   # starts NestJS on port 3000
```

**Step 2: Expose via tunnel (if testing with real Linear webhooks)**

Use a local tunnel tool (e.g., `smee`, `ngrok`) and register the URL in Linear: Settings → API → Webhooks. The registered URL must match exactly.

**Step 3: Create a Linear issue with the trigger conditions**

The issue must satisfy ALL of these (checked by `ImplementIssueCommand`):

- Type: `Issue` (not `Comment` or `IssueLabel`)
- Action: `create` or `update` (defined in `ISSUE_TRIGGER_ACTIONS` in `repos.config.ts`)
- Label: must include the label named in `LINEAR_LABEL` (from `repos.config.ts`)
- State: must be `LINEAR_STATES.todo` (from `repos.config.ts`)

**Step 4: Confirm issue moves to "In Progress"**

After the webhook is received, `IssueRepository.startImplementation()` calls Linear to move the issue state. Confirm in the Linear UI (or via Linear CLI) that the issue state changed from "Todo" → "In Progress". This proves the webhook → command → repository path is working.

**Step 5: Confirm agent spawns a worktree**

Watch server logs for the `[implement-issue] Dispatching agent` message followed by `processIssue` activity. The agent creates a git worktree and begins the Claude Code session.

**Step 6: Confirm PR is created**

The agent eventually runs `gh pr create`. Check GitHub for the PR. This is the final signal that the full pipeline completed.

### 3. `tsx` runtime: `Cannot find module` = likely `.ts` extension missing

During this session, a test run failed with `Cannot find module '@/issue/command/implement-issue.command'`. The fix was adding `.ts` to the import path. This is easy to miss when copying patterns from standard TypeScript projects. The `tsx` runtime requires the `.ts` extension — it does not accept `.js` or extensionless imports in this project.

## What a New Team Member Should Know

- **After every refactor of a NestJS service constructor**, audit all parameters for `@Inject(ConcreteClass)`. Even if the shape looks right, tsx won't inject anything without it.
- **The E2E test requires all four conditions** (type, action, label, state) to trigger the agent. Missing any one silently short-circuits at an early return in `ImplementIssueCommand.implement()`.
- **State change to "In Progress" is the first observable proof** that the webhook → command → repository path is working. Verify this before waiting for the full agent → PR flow.

## Docs & Info That Would Speed Things Up Next Time

- `src/repos.config.ts` — all trigger conditions (`LINEAR_LABEL`, `LINEAR_STATES`, `ISSUE_EVENT_TYPE`, `ISSUE_TRIGGER_ACTIONS`) are here. Read before creating a test issue.
- `docs/learned/nestjs-tsx-esbuild-decorator-setup.md` — foundational `@Inject` rule; this doc is the "refactor" case of the same rule.
- `src/issue/command/implement-issue.command.ts` — the filtering logic; check what conditions must be true to trigger the agent.
