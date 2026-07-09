export const SLACK_BOT_USERNAME = "bug-triage-bot";

export const MAX_CLARIFICATION_ROUNDS = 5;

export const DOMAIN_DOCS_DIR = "docs/domain";

export const LINEAR_AGENT_LABEL = "agent";

export const DIFFICULTY_LABELS = { easy: "easy", medium: "medium", hard: "hard" } as const;

export type DifficultyLabel = (typeof DIFFICULTY_LABELS)[keyof typeof DIFFICULTY_LABELS];

export const DIFFICULTY_VALUES = Object.values(DIFFICULTY_LABELS) as [
  DifficultyLabel,
  ...DifficultyLabel[],
];

export const FALLBACK_DIFFICULTY: DifficultyLabel = DIFFICULTY_LABELS.medium;

/**
 * User-facing reply for each distinct triage failure pattern. Each entry maps a
 * classified error (see `triage-error.ts`) to a message tailored to what the
 * reporter can actually do about it, instead of one catch-all string.
 */
export const ERROR_RESPONSE_MESSAGES = {
  /** The report was analysed, but creating the Linear issue failed. */
  linearCreationFailed:
    "I analysed your bug report, but creating the Linear issue failed. " +
    "Our team has been notified — please file the issue directly in Linear for now.",
  /** Anything not matched by a more specific pattern. */
  unknown: "Something went wrong. Please try again.",
} as const;

/**
 * Backwards-compatible alias for the generic fallback message.
 * @deprecated Prefer `classifyTriageError` + `ERROR_RESPONSE_MESSAGES`.
 */
export const WORKFLOW_ERROR_MESSAGE = ERROR_RESPONSE_MESSAGES.unknown;

/**
 * Slack reply posted when the clarification loop reaches MAX_CLARIFICATION_ROUNDS
 * without a complete report. Rather than failing, the bot files a best-effort Linear
 * issue from the detail gathered so far and tells the reporter what happened.
 */
export const buildMaxRoundsIssueCreatedMessage = (url: string): string =>
  `I couldn't gather full details after ${MAX_CLARIFICATION_ROUNDS} clarification rounds, ` +
  `so I've filed a Linear issue with the information we have so far: ${url}`;

/** Slack reply posted when an issue is created from a complete bug report. */
export const buildIssueCreatedMessage = (url: string): string => `Linear issue created: ${url}`;

export const TRIAGE_SYSTEM_PROMPT = `
You are a bug triage assistant. Evaluate whether the conversation contains:
1. A clear summary of the problem
2. Steps to reproduce
3. Expected behaviour
4. Actual behaviour
5. Environment information (OS, browser, version)

You have read-only file tools to access domain documentation. Use them to gather context:
- First list or search the docs directory to find the single most relevant bounded-context document.
- Read at most 1–2 relevant docs before deciding on completeness and clarifying questions.
- Do not read documents that aren't relevant to the bug report.

If any are missing: set isComplete to false and provide ONE focused clarifying question.
If all are present: set isComplete to true and clarifyingQuestion to null.
`.trim();

export const FORMAT_SYSTEM_PROMPT = `
You are a bug report formatter. Given the conversation, produce:
- title: a concise one-line summary of the bug (max 80 chars)
- description: a well-structured markdown description with these sections:
  ## Summary
  ## Steps to Reproduce
  ## Expected Behaviour
  ## Actual Behaviour
  ## Environment
`.trim();

export const COMPLEXITY_SYSTEM_PROMPT = `
You are an issue complexity assessor. Analyze the bug report and determine its difficulty.

You have read-only file tools to access domain documentation. Use them to gather context:
- First list or search the docs directory to find the single most relevant bounded-context document.
- Read at most 1–2 relevant docs before determining difficulty.
- Do not read documents that aren't relevant to the bug report.

Consider:
- Scope: Is the fix localized (easy) or system-wide (hard)?
- Debugging effort: Clear repro steps (easy) or needs investigation (hard)?
- Dependencies: Simple fix (easy) or requires multiple systems (hard)?
- Reproducibility: Consistent (easy) or intermittent (hard)?

Return difficulty as "easy", "medium", or "hard".
`.trim();
