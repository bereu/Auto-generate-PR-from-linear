export const CLAUDE_MESSAGE_TYPES = {
  assistant: "assistant",
  result: "result",
} as const;

export type ClaudeMessageType = (typeof CLAUDE_MESSAGE_TYPES)[keyof typeof CLAUDE_MESSAGE_TYPES];

export const CLAUDE_CONTENT_TYPES = {
  toolUse: "tool_use",
} as const;

export type ClaudeContentType = (typeof CLAUDE_CONTENT_TYPES)[keyof typeof CLAUDE_CONTENT_TYPES];

export const CLAUDE_RESULT_SUBTYPES = {
  errorMaxTurns: "error_max_turns",
  success: "success",
} as const;

export type ClaudeResultSubtype =
  (typeof CLAUDE_RESULT_SUBTYPES)[keyof typeof CLAUDE_RESULT_SUBTYPES];

// ============================================================================
// Triage Agent (Claude Agent SDK) constants
// ============================================================================

export const MCP_SERVER_NAMES = {
  linear: "linear",
  slack: "slack",
} as const;

export type McpServerName = (typeof MCP_SERVER_NAMES)[keyof typeof MCP_SERVER_NAMES];

// MCP tool names: placeholders based on Linear MCP and Slack MCP APIs
// TODO(task1): confirm exact tool names against the live MCP servers
export const LINEAR_MCP_TOOLS = {
  createIssue: "mcp__linear__create_issue",
  listIssues: "mcp__linear__list_issues",
  getIssue: "mcp__linear__get_issue",
} as const;

export const SLACK_MCP_TOOLS = {
  searchMessages: "mcp__slack__search_messages",
  readThread: "mcp__slack__read_thread",
  listChannels: "mcp__slack__list_channels",
} as const;

// Destructive Linear tools to deny (defence-in-depth alongside allowedTools/disallowedTools)
export const DESTRUCTIVE_LINEAR_TOOLS = [
  "mcp__linear__delete_issue",
  "mcp__linear__archive_issue",
  "mcp__linear__cancel_issue",
  "mcp__linear__update_issue_state",
] as const;

// Slack write/post tools to deny (all Slack posting stays on Chat SDK)
export const SLACK_WRITE_TOOLS = [
  "mcp__slack__post_message",
  "mcp__slack__send_message",
  "mcp__slack__create_channel",
  "mcp__slack__update_message",
  "mcp__slack__delete_message",
] as const;

// Triage agent models and configuration
export const TRIAGE_AGENT_MODEL = "claude-opus-4-1-20250805" as const;

export const TRIAGE_MAX_TURNS = 20;

export const LANGFUSE_PROMPT_NAMES = {
  triageAgent: "triage-agent-system",
  agentTask: "agent-task",
} as const;
