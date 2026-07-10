# End-to-End (E2E) Testing & Integration Guidance

This document provides a comprehensive guide for testing the **Slack Bug Triage to Automated PR** pipeline from end to end. It outlines the system architecture, prerequisites, local environment setup, E2E testing scenarios, state machine transitions, and troubleshooting steps.

---

## 2. Prerequisites & Environment Setup

Before starting E2E testing, ensure you have the required credentials and configuration in your local `.env` file (copied from `.env.example`).

### Required Configuration Matrix

| Environment Variable    | Source / Description                                    | Required For                          |
| :---------------------- | :------------------------------------------------------ | :------------------------------------ |
| `GITHUB_TOKEN`          | GitHub Personal Access Token (PAT) with `repo` scopes.  | PR creation and repository syncing    |
| `LINEAR_API_KEY`        | Linear Personal API Key (`Settings` → `API`).           | Issue creation and status updates     |
| `LINEAR_WEBHOOK_SECRET` | Secret key defined by you for webhook validation.       | Verifying payloads sent from Linear   |
| `SLACK_BOT_TOKEN`       | Slack Bot User OAuth Token (starts with `xoxb-`).       | Reading messages and posting replies  |
| `SLACK_SIGNING_SECRET`  | Slack app signing secret (`Basic Information`).         | Verifying incoming Slack webhooks     |
| `ANTHROPIC_API_KEY`     | Anthropic Console API key.                              | Powering the Mastra and Claude agents |
| `WORKSPACE`             | Absolute path to local workspace for git worktrees.     | Storing local checkouts during runs   |
| `LANGFUSE_PUBLIC_KEY`   | Langfuse Project Public Key _(Optional)_.               | Fetching versioned system prompts     |
| `LANGFUSE_SECRET_KEY`   | Langfuse Project Secret Key _(Optional)_.               | Fetching versioned system prompts     |
| `LANGFUSE_BASE_URL`     | Langfuse host URL (e.g., `https://cloud.langfuse.com`). | Fetching versioned system prompts     |

---

## 3. Local E2E Testing Workflow

To run and test the complete loop locally, you must expose your local server to the internet so that Slack and Linear can send webhook events.

### Step 1: Start the Local Server with Tunneling

Run the following command to start the NestJS server on port `3000` and automatically establish a public HTTPS tunnel via `localtunnel`:

```bash
pnpm run dev:local
```

Upon startup, the console will print a configuration guide similar to this:

```text
🧪 [LOCAL] Starting webhook server (repo sync skipped)
✅ Webhook server on port 3000
🌐 Opening public tunnel...

──────────────────────────────────────────────────────
🌐 Public URL: https://heavy-forks-jump.loca.lt
──────────────────────────────────────────────────────
Register this URL in Linear:
  Settings → API → Webhooks → New Webhook
  URL:    https://heavy-forks-jump.loca.lt/webhook
  Secret: (value of LINEAR_WEBHOOK_SECRET in .env)
──────────────────────────────────────────────────────
```

#### Use a stable tunnel URL (strongly recommended)

By **default the localtunnel URL is random and changes on every restart** — the single most common cause of "the bot never responds," because your Slack/Linear Request URL silently points at a dead tunnel. To get a **stable URL** that survives restarts, run the server and tunnel separately with a fixed `--subdomain`:

```bash
# Terminal 1 — server only (no tunnel)
pnpm run dev:server

# Terminal 2 — stable tunnel to port 3000 (pick a unique name)
npx localtunnel --port 3000 --subdomain my-bugbot
#   → your url is: https://my-bugbot.loca.lt   (same every restart)
```

The `--subdomain` is **best-effort**: if the name is already taken on loca.lt it silently falls back to a random URL, so always confirm the URL that was actually granted.

#### Verify the tunnel before configuring providers

Run these two checks against the **public** URL — they isolate a tunnel problem from a routing/auth problem in seconds:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<your-url>.loca.lt/health
#   → 200  (server reachable through the tunnel)

curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  -H "Content-Type: application/json" -d '{}' \
  https://<your-url>.loca.lt/slack/events
#   → 401  (route reachable + signature guard active — NOT 404)
```

> [!IMPORTANT]
> Keep the tunnel process running. If the tunnel closes or restarts **without** a fixed `--subdomain`, the public URL changes and you must re-enter it in Slack and Linear. Use `--subdomain` to avoid this.

> [!TIP]
> `localtunnel` is unreliable (intermittent `408`/`502`). For a genuinely stable, fixed URL prefer **ngrok** with a reserved domain: `ngrok http 3000 --domain=<your-reserved-domain>`. See [ADR GEN-003](./adr/GEN-003-local-tunnel-for-webhook-testing.md) for the full tunnel policy.

### Step 2: Configure Webhooks

#### 1. Slack Application Integration

1. Go to your [Slack App Dashboard](https://api.slack.com/apps).
2. Under **Event Subscriptions**, enable events and set the **Request URL** to:
   `https://<your-localtunnel-subdomain>.loca.lt/slack/events`
3. Subscribe to the following bot events:
   - `app_mention`
   - `message.channels` (for monitoring thread replies)
4. Save Changes.

#### 2. Linear Integration

1. Go to **Linear** → **Settings** → **API** → **Webhooks**.
2. Click **New Webhook**.
3. Set the **URL** to:
   `https://<your-localtunnel-subdomain>.loca.lt/webhook`
4. Set the **Secret** to match your `LINEAR_WEBHOOK_SECRET` environment variable.
5. Check the box for **Issues** (Create, Update).
6. Save the webhook.

---

## 4. Execution & Verification Scenarios

### Scenario 1: Slack Bug Intake & Conversational Triage

This scenario verifies that the Mastra Agent properly triages raw Slack posts and asks clarifying questions for incomplete reports.

1. **Trigger Triage**: Mention your Slack Bot in a designated channel with an incomplete bug report:
   > `@BugAgent I found a bug in the settings page. When I click save, nothing happens.`
2. **In-Thread Clarification**:
   - The bot should automatically respond in a new thread asking for specific missing information (e.g., reproduction steps, environment, browser console errors).
3. **Conversational Responses**:
   - Reply in-thread with some details. The bot will re-evaluate.
   - Continue the conversation. If `MAX_CLARIFICATION_ROUNDS` (3) is reached without completion, the bot will post the fallback message and unsubscribe.
4. **Issue Creation on Success**:
   - Provide a complete response (e.g., browser, expected vs actual behavior, steps).
   - Once the Mastra agent evaluates the state as complete (`isComplete: true`), it creates a Linear issue.
   - The bot posts the Linear issue link in the Slack thread and unsubscribes.

### Scenario 2: Automated Code Implementation & PR Creation

This scenario verifies the webhook execution path, workspace checkouts, Claude Agent execution, and PR creation.

1. **Trigger Webhook**:
   - Locate the Linear issue created from **Scenario 1** (or create a new Linear issue manually).
   - Ensure the issue has the label **`agent`** and its status is **`Todo`**.
2. **Watch Server Logs**:
   - You should see the server intercepting the webhook:
     `[implement-issue] Dispatching agent for ISSUE-123: Fix settings crash`
   - The server transitions the Linear status to **`In Progress`** and posts a comment:
     _`🤖 Claude is starting implementation...`_
3. **Workspace Isolation Verification**:
   - Navigate to your configured `WORKSPACE` directory. You should see a new git worktree created:
     `workspace/harness-enginearing-todo-test/issue-ISSUE-123`
4. **Agent Execution**:
   - Watch the server logs. You will see tool usage outputs in real-time:
     `🔧 [ISSUE-123] Read: {...}`
     `🔧 [ISSUE-123] Write: {...}`
     `🔧 [ISSUE-123] Bash(npm test): {...}`
5. **PR Creation & Completion**:
   - Once Claude successfully implements the fix and passes the linters/tests, it pushes a feature branch (`claude/issue-ISSUE-123`) and opens a Pull Request on GitHub.
   - The server transitions the Linear status to **`In Review`**.
   - The server posts a comment on the Linear issue containing the PR URL:
     _`✅ Claude completed implementation! Pull Request created: https://github.com/.../pull/12`_
   - The temporary git worktree is deleted from your workspace directory.

---

## 5. State Machine & Transition Rules

To prevent loops and duplicate agent runs, the state transitions are strictly governed by the following state machine:

| Status Transition               | Trigger Event                                                                   | Action Performed                                                                        |
| :------------------------------ | :------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------- |
| **`Todo` → `In Progress`**      | Webhook received for `Issue` (labeled `agent` in `Todo` state).                 | Comment posted to Linear; Git worktree initialized; Claude Agent spawned.               |
| **`In Progress` → `In Review`** | Claude Agent finishes execution successfully.                                   | GitHub branch pushed; PR created; PR URL posted as comment; Git worktree cleaned up.    |
| **`In Progress` → `Suspended`** | Claude Agent runs out of turns (`MAX_TURNS` = 1000) or terminates unexpectedly. | Comment posted to Linear; Git worktree cleaned up; Issue prefixed with `[SUSPEND]`.     |
| **`In Progress` → `Todo`**      | System/infrastructure error occurs (e.g., git checkouts fail).                  | Comment posted to Linear; Git worktree cleaned up; state reverted to allow human retry. |

---

## 6. Troubleshooting & Diagnostics

> [!WARNING]
> **Issue Status Stuck in "In Progress"**
> If a run crashes silently or the process is killed while Claude is running, the issue will remain in `In Progress`. To retry, manually reset the Linear issue status back to `Todo`.

### 0. Bot Doesn't Respond in Slack (No Reply, No Logs)

If a Slack mention produces no bot reply **and nothing appears in the server logs**, the event is not reaching the app. Check, in order:

1. **Stale tunnel URL.** localtunnel URLs change on restart. Confirm the URL in Slack's **Event Subscriptions → Request URL** matches the currently-running tunnel. Use a fixed `--subdomain` (see Step 1) to eliminate this class of failure.
2. **Tunnel down.** Verify `curl https://<your-url>.loca.lt/health` returns `200`. localtunnel drops frequently (`408`/`502`); restart it or switch to ngrok.
3. **Wrong path.** Slack must point at `/slack/events` (not `/webhook`, which is Linear).

If the event **does** reach the app but the route returns `404` (`{"code":"NOT_FOUND"}`), this is a **route-shadowing bug, not a tunnel problem** — a mounted NestJS module (e.g. an SDK's `*Module.register()`) may install a catch-all that shadows `POST /slack/events` and `POST /webhook`. Diagnose by hitting the route locally: `curl -X POST http://localhost:3000/slack/events` should return `401` (route present), not `404`. If it returns `404`, remove/replace the offending module. See [ADR GEN-003](./adr/GEN-003-local-tunnel-for-webhook-testing.md).

### 1. Webhook Signature Verification Failures

If you receive a `401 Unauthorized` error when Linear webhooks arrive:

- Verify that `LINEAR_WEBHOOK_SECRET` in `.env` matches the secret registered in your Linear webhook settings.
- Ensure the payload is transmitted as raw JSON and that the NestJS bodyParser verification handler is not missing or failing to capture `req.rawBody`.

### 2. Git Worktree Clashes

If you see errors related to git worktrees already existing:

- Check the `workspace/` directory for stale worktree directories.
- Stale worktrees can be cleaned up manually by running:
  ```bash
  git worktree prune
  ```

### 3. Langfuse Connection Failures

If the Langfuse API is down or credentials are misconfigured:

- The system will log a warning: `[langfuse] Prompt fetch failed... using local default`
- The triage process will fall back to using the local system prompt constant (`TRIAGE_SYSTEM_PROMPT`), ensuring the bot remains functional.

---

## 7. Useful Diagnostic Commands

Execute these commands during development to ensure code quality and rule compliance:

- **Run unit and integration tests:**
  ```bash
  pnpm test
  ```
- **Execute prompt evaluations (Promptfoo):**
  ```bash
  pnpm run eval
  ```
- **Check codebase for style/linting errors:**
  ```bash
  pnpm lint
  ```
