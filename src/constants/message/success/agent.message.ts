export const AGENT_MESSAGES = {
  agentStarting: "Agent starting implementation",
  agentResuming: "Agent resuming implementation",
  agentComplete: (prUrl: string) => `Agent completed implementation. Review the PR: ${prUrl}`,
  agentSuspended: "Agent suspended (max turns reached)",
  agentStopped: (reason: string) => `Agent stopped: ${reason}`,
  agentTerminated:
    "Agent terminated unexpectedly (cost limit or process interruption). Manual review required.",
  agentFailed: (reason: string) =>
    `Agent failed with system error: ${reason}. Issue reset to pending.`,
  prNotFound: "(PR not found)",
} as const;
