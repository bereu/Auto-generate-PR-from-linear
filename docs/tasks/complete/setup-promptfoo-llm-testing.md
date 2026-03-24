# Setup: Developer can evaluate agent prompts with promptfoo

## Context

This project uses the Claude Agent SDK to auto-implement Linear issues. The agent's
quality depends heavily on the prompt in `prompts/task.md`. Currently there is no
systematic way to evaluate prompt quality or catch regressions.

promptfoo provides a test framework for LLM applications — it runs prompts against
test cases and asserts on outputs, making it possible to catch prompt regressions in CI.

Reference: https://www.promptfoo.dev/docs/installation/

## Current State

- `src/prompt-loader.ts` renders prompts via nunjucks
- `prompts/task.md` is the main agent prompt (interpolated with `title`, `description`,
  `workBranch`, `repoFullName`, `prTitle`, `prBody`)
- No tests exist for prompt output quality

## Target State

- `promptfoo` installed as a dev dependency
- `promptfooconfig.yaml` at project root defining providers, prompts, and test cases
- `npm run eval` script that runs `promptfoo eval`
- At least one test case per prompt variable set, with assertions on output structure
- (Optional) CI integration via `promptfoo eval --ci`

## Action Items

### 1. Install promptfoo ✅

```bash
pnpm add -D promptfoo
```

Verify the CLI is available:

```bash
pnpm exec promptfoo --version
```

Note: `better-sqlite3` native module must be rebuilt for Node.js v24:
`npx node-gyp rebuild` from the better-sqlite3 package dir, or run via `node_modules/.bin/promptfoo`.

### 2. Create `prompts/task.md` ✅

The prompt file must exist for tests to run. Confirm path and content — it is loaded by
`loadPrompt("task", vars)` which resolves to `prompts/task.md` relative to the project root.

### 3. Create `promptfooconfig.yaml` ✅

At the project root, create the promptfoo configuration:

```yaml
# promptfooconfig.yaml
description: "Agent prompt evaluation"

prompts:
  - prompts/task.md

providers:
  - id: anthropic:messages:claude-sonnet-4-6
    config:
      max_tokens: 1024

defaultTest:
  assert:
    - type: llm-rubric
      value: "Response includes a clear plan of action for the task"

tests:
  - description: "Simple bug fix task"
    vars:
      title: "Fix null pointer in login flow"
      description: "Users see a crash when logging in with an empty email field"
      workBranch: "feat/fix-login-null-AGT-001"
      repoFullName: "acme/frontend"
      prTitle: "feat: Fix null pointer in login flow [AGT-001]"
      prBody: "## Linear タスク\nhttps://linear.app/acme/issue/AGT-001\n\n## 変更概要\nClaude Code による自動実装"
    assert:
      - type: contains
        value: "null"
      - type: llm-rubric
        value: "The response addresses the specific bug described in the description"

  - description: "New feature task"
    vars:
      title: "Add dark mode toggle"
      description: "Add a toggle button in settings that switches the UI to dark mode"
      workBranch: "feat/add-dark-mode-AGT-002"
      repoFullName: "acme/frontend"
      prTitle: "feat: Add dark mode toggle [AGT-002]"
      prBody: "## Linear タスク\nhttps://linear.app/acme/issue/AGT-002\n\n## 変更概要\nClaude Code による自動実装"
    assert:
      - type: llm-rubric
        value: "The response includes implementation steps for a dark mode toggle"
```

### 4. Add `eval` script to `package.json` ✅

```json
"eval": "promptfoo eval"
```

### 5. Verify setup ✅

```bash
pnpm run eval
```

Expected: promptfoo renders the prompt template, calls the provider, and reports pass/fail
for each assertion. (Requires `ANTHROPIC_API_KEY` env var at runtime.)

### 6. Add `.promptfoo/` to `.gitignore` ✅

promptfoo writes a local cache to `.promptfoo/`. Added to `.gitignore` to avoid
committing test artefacts.

## Acceptance Criteria

- [x] `pnpm add -D promptfoo` installs without errors
- [x] `promptfooconfig.yaml` exists at project root with at least 2 test cases
- [x] `pnpm run eval` executes without crashing and reports assertion results
- [x] `npm run lint` still passes with 0 errors
