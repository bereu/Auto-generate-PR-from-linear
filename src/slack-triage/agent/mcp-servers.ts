import { logger } from "@/util/logger";
import {
  LINEAR_MCP_TOOLS,
  SLACK_MCP_TOOLS,
  DESTRUCTIVE_LINEAR_TOOLS,
  SLACK_WRITE_TOOLS,
} from "@/constants/agent.constants";

/**
 * Deny-hook for destructive Linear MCP tools (delete/archive/cancel).
 * Inspects the tool name to identify destructive patterns.
 * Defense-in-depth: runs alongside the `disallowedTools` denylist.
 */
export function denyDestructiveLinear(toolName: string): void {
  // Match destructive Linear tool patterns
  const isDestructive =
    DESTRUCTIVE_LINEAR_TOOLS.some((t) => toolName === t) || /delete|archive|cancel/i.test(toolName);

  if (isDestructive) {
    logger.warn(`[triage-agent] Blocking destructive Linear tool: ${toolName}`);
    throw new Error(`Tool '${toolName}' is destructive and not allowed`);
  }
}

/**
 * Deny-hook for Slack MCP write/post tools.
 * Fails closed: only whitelisted Slack read/search tools are allowed.
 * Defense-in-depth: runs alongside the `disallowedTools` denylist.
 */
export function denySlackWrites(toolName: string): void {
  // Whitelist of allowed Slack tools (read/search only)
  const allowedSlackTools = Object.values(SLACK_MCP_TOOLS);
  const isAllowed = allowedSlackTools.some((t) => toolName === t);

  if (!isAllowed && toolName.startsWith("mcp__slack__")) {
    logger.warn(`[triage-agent] Blocking Slack write tool: ${toolName}`);
    throw new Error(`Tool '${toolName}' is a Slack write tool and not allowed`);
  }
}

/**
 * Build MCP server configuration for the triage agent.
 * Includes:
 * - Linear MCP server (create + minimal reads)
 * - Slack MCP server (read/search only, optional if env vars unset)
 * - Tool access control (allowedTools, disallowedTools, PreToolUse deny-hooks)
 *
 * Returns the options object to pass to the Claude Agent SDK query().
 */
export function buildMcpServersConfig(): {
  mcpServers: Record<
    string,
    {
      type: "sse" | "http";
      url: string;
      headers?: Record<string, string>;
    }
  >;
  allowedTools: string[];
  disallowedTools: string[];
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hooks: Array<(toolName: string) => void>;
    }>;
  };
} {
  const mcpServers = setupMcpServers();
  const allowedTools = buildAllowedTools(mcpServers);
  const disallowedTools = buildDisallowedTools();
  const hooks = buildDenyHooks();

  logMcpConfiguration(mcpServers, allowedTools, disallowedTools);

  return {
    mcpServers,
    allowedTools,
    disallowedTools,
    hooks,
  };
}

type McpServerConfig = {
  type: "sse" | "http";
  url: string;
  headers?: Record<string, string>;
};

/**
 * Setup Linear MCP server with authorization headers.
 */
function setupLinearMcp(): McpServerConfig {
  const linearMcpUrl = process.env.LINEAR_MCP_URL;
  const linearMcpToken = process.env.LINEAR_MCP_TOKEN;

  if (!linearMcpUrl || !linearMcpToken) {
    throw new Error("LINEAR_MCP_URL and LINEAR_MCP_TOKEN env vars are required for triage agent");
  }

  return {
    type: "sse",
    url: linearMcpUrl,
    headers: {
      Authorization: `Bearer ${linearMcpToken}`,
    },
  };
}

/**
 * Setup optional Slack MCP server (read/search only).
 */
function setupSlackMcp(): McpServerConfig | null {
  const slackMcpUrl = process.env.SLACK_MCP_URL;
  const slackMcpToken = process.env.SLACK_MCP_TOKEN;

  if (!slackMcpUrl || !slackMcpToken) {
    logger.warn(
      "[triage-agent] Slack MCP env vars (SLACK_MCP_URL/SLACK_MCP_TOKEN) not set; " +
        "agent will proceed without workspace duplicate-search capability (R3 mitigation: non-blocking)",
    );
    return null;
  }

  return {
    type: "http",
    url: slackMcpUrl,
    headers: {
      Authorization: `Bearer ${slackMcpToken}`,
    },
  };
}

/**
 * Configure Linear and Slack MCP servers from environment variables.
 */
function setupMcpServers(): Record<string, McpServerConfig> {
  const mcpServers: Record<string, McpServerConfig> = {};
  mcpServers.linear = setupLinearMcp();

  const slackConfig = setupSlackMcp();
  if (slackConfig) {
    mcpServers.slack = slackConfig;
  }

  return mcpServers;
}

/**
 * Build allowlist: minimal Linear tools + Slack read/search only.
 */
function buildAllowedTools(
  mcpServers: Record<
    string,
    {
      type: string;
      url: string;
    }
  >,
): string[] {
  const hasSlackMcp = mcpServers.slack !== undefined;
  return [
    LINEAR_MCP_TOOLS.createIssue,
    LINEAR_MCP_TOOLS.listIssues,
    LINEAR_MCP_TOOLS.getIssue,
    ...(hasSlackMcp ? Object.values(SLACK_MCP_TOOLS) : []),
  ];
}

/**
 * Build denylist: destructive Linear + ALL Slack write/post.
 */
function buildDisallowedTools(): string[] {
  return [...DESTRUCTIVE_LINEAR_TOOLS, ...SLACK_WRITE_TOOLS];
}

/**
 * Build PreToolUse deny-hooks: defense-in-depth.
 */
function buildDenyHooks(): {
  PreToolUse?: Array<{
    matcher: string;
    hooks: Array<(toolName: string) => void>;
  }>;
} {
  return {
    PreToolUse: [
      {
        matcher: "mcp__linear__.*",
        hooks: [denyDestructiveLinear],
      },
      {
        matcher: "mcp__slack__.*",
        hooks: [denySlackWrites],
      },
    ],
  };
}

/**
 * Log MCP configuration for debugging purposes.
 */
function logMcpConfiguration(
  mcpServers: Record<string, { type: string; url: string }>,
  allowedTools: string[],
  disallowedTools: string[],
): void {
  const slackEnabled = mcpServers.slack !== undefined;
  logger.info(
    `[triage-agent] MCP servers configured: Linear (required), ` +
      `Slack ${slackEnabled ? "(optional read/search)" : "(disabled)"}`,
  );
  logger.debug(`[triage-agent] allowedTools (${allowedTools.length}): ${allowedTools.join(", ")}`);
  logger.debug(
    `[triage-agent] disallowedTools (${disallowedTools.length}): ${disallowedTools.join(", ")}`,
  );
}
