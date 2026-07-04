// Mastra agent + Langfuse prompt identifiers.
// Centralised here to satisfy GEN-001 (no magic strings in business logic).

export const AGENT_NAMES = {
  bugTriage: "bug-triage",
} as const;

export type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];

export const AGENT_MODELS = {
  bugTriage: "claude-haiku-4-5-20251001",
} as const;

export const LANGFUSE_PROMPT_NAMES = {
  bugTriage: "bug-triage-system",
  bugReportFormat: "bug-report-format-system",
  agentTask: "agent-task",
} as const;

export type LangfusePromptName = (typeof LANGFUSE_PROMPT_NAMES)[keyof typeof LANGFUSE_PROMPT_NAMES];
