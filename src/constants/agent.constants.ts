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
} as const;

export type ClaudeResultSubtype =
  (typeof CLAUDE_RESULT_SUBTYPES)[keyof typeof CLAUDE_RESULT_SUBTYPES];
