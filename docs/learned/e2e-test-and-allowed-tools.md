# What I Learned: E2E Test Process and Sub-Agent Tool Constraints

**Date:** 2026-03-25

## What I Learned This Session

### 1. Sub-agent `allowedTools` excludes `Edit` — only `Read` and `Write` for files

`src/agent.ts` passes an explicit `allowedTools` to the Claude Agent SDK:

```ts
allowedTools: [
  "Read",
  "Write",
  "Skill",
  "Bash(git add *)",
  "Bash(git commit *)",
  "Bash(git push *)",
  "Bash(gh pr create *)",
  "Bash(npm test)",
  "Bash(npm run lint)",
],
```

`Edit` is **not** in the list. The sub-agent that implements issues can only use `Read` and `Write` for file edits — it cannot use the `Edit` tool. This is not documented anywhere in the codebase; you only discover it by reading `agent.ts` directly. If the sub-agent prompt or CLAUDE.md in the target repo instructs Claude to use `Edit`, those calls will be rejected.

### 2. `settingSources: ["project"]` loads the TARGET repo's `.claude/`, not the agent server's

```ts
options: {
  cwd: wtPath,
  settingSources: ["project"],
  ...
}
```

`cwd` is the worktree path of the target repo (e.g., `harness-for-todo-app`). With `settingSources: ["project"]`, the sub-agent reads **that repo's** `CLAUDE.md`, skills, and hooks — not the `auto-generate-code-from-linear` server's own config. This means the target repo's CLAUDE.md instructions directly control sub-agent behavior.

### 3. E2E test procedure for the full pipeline

To verify the pipeline end-to-end locally:

1. Start the webhook server: `npm run start`
2. Expose it via tunnel: `lt --port 3000` (localtunnel)
3. In Linear: create an issue, assign the `agent` label, set state to `Todo`
4. Watch server logs — it should log `▶ [ISSUE_ID] title` then tool calls
5. Verify Linear state changes: `Todo` → `In Progress` → `In Review`
6. Verify a GitHub PR was created in the target repo

If the server is running but nothing happens, check: label name matches `LINEAR_LABEL` in `repos.config.ts`, and the webhook URL in Linear settings is pointing at the current tunnel URL.

### 4. ADRs in this project must be ≤100 lines

ADR files under `docs/adr/` should not exceed 100 lines. This is an unstated team rule — the user explicitly enforced it when asking for ADR-001. There is no linter for this; it is a manual constraint.

## What a New Team Member Should Know

- When debugging why the sub-agent fails at a certain tool call, the first thing to check is `allowedTools` in `src/agent.ts`. Not all Claude tools are permitted.
- The target repo's `.claude/CLAUDE.md` is active during the sub-agent run. If that file has hooks or rules, they will fire on the sub-agent's tool calls.
- The trigger label name (`agent`) is defined in `repos.config.ts` as `LINEAR_LABEL`. Renaming the label in Linear without updating this constant silently breaks all automation.

## Docs & Info That Would Speed Things Up Next Time

- `src/agent.ts` lines 57–67 — the `allowedTools` list; check here before debugging sub-agent tool failures.
- `prompts/task.md` — the prompt given to the sub-agent; must use only allowed tools.
- `docs/adr/ADR-001-webhook-driven-agent-architecture.md` — the authoritative architecture spec.
