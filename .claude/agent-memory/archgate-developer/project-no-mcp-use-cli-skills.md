---
name: project-no-mcp-use-cli-skills
description: This project deliberately avoids Slack/Linear MCP servers; it uses CLI tools via skills instead
metadata:
  type: project
---

For Slack and Linear integration, this project deliberately does **NOT** use MCP servers. It uses CLI tools wrapped in skills:

- Slack → `slack-cli` (@urugus/slack-cli), skill `.claude/skills/use-slack/`
- Linear → `linear` (schpet/linear-cli, binary is `linear` not `linear-cli`), skill `.claude/skills/use-linear/`

**Why:** The user found MCP OAuth management too tiresome (decided 2026-07-12 after discovering the Claude Agent SDK's `McpHttpServerConfig` only supports static `headers`, not the interactive OAuth flow that `mcp.slack.com` requires — unworkable for a headless Fly.io server).

**How to apply:** Reach for the `use-slack` / `use-linear` skills (CLI calls via Bash), not `mcp__slack__*` / `mcp__linear__*` tools. The triage agent was fully migrated off MCP (2026-07-12): `src/slack-triage/agent/agent-tools.ts` (formerly `mcp-servers.ts`) now builds a skills+Bash config with a fail-closed PreToolUse deny-hook; ARCH-001 and BE-004 were amended to match. Deploy follow-up (Dockerfile CLI install + Fly secrets `LINEAR_API_KEY`/`SLACK_API_TOKEN`) is documented in `docs/mcp-to-cli-skills-migration/` but NOT yet applied.
