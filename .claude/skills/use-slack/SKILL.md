---
name: use-slack
description: Interact with Slack from the command line via slack-cli (@urugus/slack-cli). Use whenever you must read Slack channels/threads, search workspace messages, look up users, or post/reply to messages — e.g. duplicate-detection for triage, posting status updates, or fetching thread context. Prefer this over any Slack MCP server.
version: 1.0.0
---

## Overview

This project uses the **`slack-cli`** command-line tool ([@urugus/slack-cli](https://github.com/urugus/slack-cli)) for all Slack access. We deliberately do **not** use a Slack MCP server (OAuth management overhead). Anything you would have done via `mcp__slack__*` tools, do with `slack-cli` instead.

## Prerequisites

- Binary: `slack-cli` (installed globally via `npm install -g @urugus/slack-cli`).
- It is linked at `~/.vite-plus/bin/slack-cli`. If `slack-cli` is "command not found", prepend `~/.vite-plus/bin` to `PATH`.
- Verify: `slack-cli --version` (expected `0.27.0`+).

## Authentication (one-time, run by the user)

A Slack API token must be configured before first use. **Never inline the token on the command line.** Use interactive prompt or stdin:

```bash
# Interactive (recommended)
slack-cli config set

# Non-interactive from an env/secret WITHOUT echoing it into the command:
printf '%s\n' "$SLACK_API_TOKEN" | slack-cli config set --token-stdin
```

- Tokens are encrypted at rest (AES-256-GCM); master key at `~/.slack-cli-secrets/master.key`.
- **Use a User token (`xoxp-`)** — `search` requires a user token and is _not_ supported with bot tokens.
- Required scopes: `search:read`, `channels:read`, `channels:history`, `groups:read`, `groups:history`, `im:history`, `users:read`, and `chat:write` (only if posting).
- Multi-workspace: `slack-cli config set --profile <name>`, then pass `--profile <name>` / `-p <name>` to any command.
- Check config: `slack-cli config current` / `slack-cli config get`.

## Common commands

Add `--format json` to any read command for machine-parseable output.

**List channels**

```bash
slack-cli channels                          # public channels
slack-cli channels --type all --format json # include IMs/MPIMs, JSON
```

**Read history / a thread** (for pulling context or duplicate detection)

```bash
slack-cli history -c general -n 20                          # last 20 in #general
slack-cli history -c general --thread 1719207629.000100     # a specific thread
slack-cli history --url "https://your.slack.com/archives/C123/p1780638511660849"
slack-cli history -c general --since "2024-01-01 00:00:00"
```

**Search messages** (requires user token)

```bash
slack-cli search -q "deploy error" --format json
slack-cli search -q "in:general from:@alice oauth" -n 50
```

**Look up users**

```bash
slack-cli users list --format json
slack-cli users lookup <query>
```

**Post / reply** (only when the task explicitly calls for writing to Slack)

```bash
slack-cli send -c channel-name -m "Message text"
slack-cli send -c channel-name -m "Reply text" -t 1719207629.000100   # thread reply
slack-cli send --user @john -m "DM text"
```

## Guidance

- **Read/search first, write only when instructed.** Posting to Slack is a side effect — do not post unless the task explicitly asks for it.
- Prefer `--format json` when you need to parse results programmatically.
- If `search` errors about token type, the configured token is a bot token — a user token (`xoxp-`) is required.
- Full command list: `slack-cli --help` and `slack-cli <command> --help`.
