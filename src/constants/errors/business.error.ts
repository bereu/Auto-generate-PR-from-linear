export class BusinessError extends Error {
  constructor(
    message: string,
    public readonly properties: Record<string, unknown>,
  ) {
    super(message);
    this.name = "BusinessError";
  }
}

export class UnknownRepoError extends BusinessError {
  constructor(issueId: string, repoLabel: string) {
    super(`Unknown repo label: ${repoLabel}`, { issueId, repoLabel });
    this.name = "UnknownRepoError";
  }
}

/**
 * Marker message for InsufficientBugDetailError. Exported so error classification
 * can still recognise the failure after Mastra serializes the thrown error across
 * the workflow boundary (which strips the class prototype, breaking `instanceof`).
 */
export const INSUFFICIENT_BUG_DETAIL_MESSAGE =
  "Bug triage could not gather sufficient details after maximum clarification rounds";

export class InsufficientBugDetailError extends BusinessError {
  constructor(botTurns: number) {
    super(INSUFFICIENT_BUG_DETAIL_MESSAGE, { botTurns });
    this.name = "InsufficientBugDetailError";
  }
}

export class MaxTurnsReachedError extends BusinessError {
  constructor(issueId: string) {
    super("Claude max turns reached", { issueId });
    this.name = "MaxTurnsReachedError";
  }
}

export class ClaudeTerminatedError extends BusinessError {
  constructor(issueId: string) {
    super("Claude terminated unexpectedly (cost limit or process kill)", { issueId });
    this.name = "ClaudeTerminatedError";
  }
}
