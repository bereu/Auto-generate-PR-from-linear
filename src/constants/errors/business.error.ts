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
