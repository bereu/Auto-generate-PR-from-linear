import type { PreToolUseHookInput, HookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "@/util/logger";
import { DENIED_CLI_PATTERNS } from "@/constants/agent.constants";

// Command logging constants (per GEN-001: no magic numbers)
const COMMAND_LOG_START = 0;
const COMMAND_LOG_MAX_LEN = 100;

/**
 * Agent tools configuration for the triage agent (Claude Agent SDK).
 * The agent operates through CLI-backed skills (use-linear, use-slack) invoked
 * via the Bash tool, scoped by allowedTools and a fail-closed PreToolUse deny-hook.
 */
interface AgentToolsConfig {
  settingSources: string[];
  skills: string[];
  allowedTools: string[];
  disallowedTools: string[];
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hooks: Array<
        (
          input: PreToolUseHookInput,
          toolUseID: string | undefined,
          options: { signal: AbortSignal },
        ) => Promise<HookJSONOutput>
      >;
    }>;
  };
}

/**
 * Build agent tools configuration for the triage agent.
 * The agent runs with skill discovery enabled (use-linear, use-slack) and Bash
 * tool access, with a PreToolUse deny-hook that pattern-matches command strings
 * and blocks (returns deny) on destructive/write patterns (fail-closed).
 *
 * Returns configuration object to pass to Claude Agent SDK query() options.
 */
export function buildAgentToolsConfig(): AgentToolsConfig {
  const config = {
    settingSources: ["user", "project"],
    skills: ["use-slack", "use-linear"],
    allowedTools: ["Bash", "Skill", "Read"],
    disallowedTools: [] as string[],
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [denyDestructiveCliCommands],
        },
      ],
    },
  };

  logAgentConfiguration(config);

  // Log gracefully if Slack auth is not configured (non-blocking duplicate-search)
  if (!process.env.SLACK_CLI_MASTER_KEY) {
    logger.warn(
      "[triage-agent] SLACK_CLI_MASTER_KEY not set; " +
        "if running in an ephemeral env, slack-cli auth may be unavailable and " +
        "duplicate-search will be skipped (non-blocking)",
    );
  }

  return config;
}

/**
 * PreToolUse deny-hook for destructive/write Bash commands.
 * Inspects the command string against DENIED_CLI_PATTERNS.
 * Returns deny decision if pattern matches; returns empty {} to allow.
 * Fail-closed: denies by default, allows only on explicit empty return.
 *
 * SDK contract:
 * - input: PreToolUseHookInput with tool_name, tool_input.command
 * - toolUseID: string | undefined
 * - options: { signal: AbortSignal }
 * - Returns: Promise<HookJSONOutput> with hookSpecificOutput.permissionDecision
 */
async function denyDestructiveCliCommands(
  input: PreToolUseHookInput,
  _toolUseID: string | undefined,
  _options: { signal: AbortSignal },
): Promise<HookJSONOutput> {
  // Only inspect Bash tool; other tools (Read, Skill) pass through
  if (input.tool_name !== "Bash") {
    return {};
  }

  // Extract command from tool_input (snake_case field)
  const toolInput = input.tool_input as { command?: string } | undefined;
  const command = String(toolInput?.command ?? "");

  // Check against deny patterns
  const isDestructive = DENIED_CLI_PATTERNS.some((pattern) => pattern.test(command));

  if (isDestructive) {
    logger.warn(
      `[triage-agent] Blocking destructive CLI command: ${command.slice(COMMAND_LOG_START, COMMAND_LOG_MAX_LEN)}...`,
    );
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "Command matches a denied destructive/write pattern (delete, archive, state change, etc)",
      },
    };
  }

  // Allow: return empty object (no-op)
  return {};
}

/**
 * Log agent configuration for debugging purposes.
 */
function logAgentConfiguration(config: AgentToolsConfig): void {
  logger.info(
    `[triage-agent] Agent tools configured: skills=[${config.skills.join(", ")}], ` +
      `allowedTools=[${config.allowedTools.join(", ")}], PreToolUse deny-hook enabled`,
  );
  logger.debug(`[triage-agent] settingSources: ${config.settingSources.join(", ")}`);
}
