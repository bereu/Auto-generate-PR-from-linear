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

/**
 * Patterns of CLI commands that are destructive/write and must be denied.
 * Applied via PreToolUse hook on Bash tool; fail-closed if matched.
 * Patterns use boundary matching to catch commands in shell chains (&&, |, ;, etc).
 */
export const DENIED_CLI_PATTERNS: RegExp[] = [
  // Linear: destructive operations (delete, archive, cancel, trash)
  /(^|[\s;&|(`])linear\s+issue\s+(delete|archive|cancel|trash)\b/i,
  // Linear: state changes via update (reconciliation owns state transitions)
  /(^|[\s;&|(`])linear\s+issue\s+update\b.*--state\b/i,
  // Linear: start command (starts move state; reconciliation owns state)
  /(^|[\s;&|(`])linear\s+issue\s+start\b/i,
  // Slack: all write operations (posting, editing, deleting, uploading, reactions, pinning)
  /(^|[\s;&|(`])slack-cli\s+(send|edit|delete|upload|reaction|pin)\b/i,
] as const;

// Triage agent models and configuration
export const TRIAGE_AGENT_MODEL = "claude-opus-4-1-20250805" as const;

export const TRIAGE_MAX_TURNS = 20;

export const LANGFUSE_PROMPT_NAMES = {
  triageAgent: "triage-agent-system",
  agentTask: "agent-task",
} as const;
