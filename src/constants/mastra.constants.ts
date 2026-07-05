// Mastra agent + Workflow + Langfuse prompt identifiers.
// Centralised here to satisfy GEN-001 (no magic strings in business logic).

export const AGENT_NAMES = {
  bugTriage: "bug-triage",
} as const;

export type AgentName = (typeof AGENT_NAMES)[keyof typeof AGENT_NAMES];

export const AGENT_MODELS = {
  bugTriage: "claude-haiku-4-5-20251001",
} as const;

export const WORKFLOW_NAMES = {
  bugTriage: "bug-triage",
} as const;

export type WorkflowName = (typeof WORKFLOW_NAMES)[keyof typeof WORKFLOW_NAMES];

export const WORKFLOW_STEP_IDS = {
  evaluate: "evaluate-bug-report",
  createIssue: "create-linear-issue",
  ask: "ask-clarifying-question",
  fallback: "post-fallback-message",
} as const;

export type WorkflowStepId = (typeof WORKFLOW_STEP_IDS)[keyof typeof WORKFLOW_STEP_IDS];

export const LANGFUSE_PROMPT_NAMES = {
  bugTriage: "bug-triage-system",
  bugReportFormat: "bug-report-format-system",
  agentTask: "agent-task",
} as const;

export type LangfusePromptName = (typeof LANGFUSE_PROMPT_NAMES)[keyof typeof LANGFUSE_PROMPT_NAMES];
