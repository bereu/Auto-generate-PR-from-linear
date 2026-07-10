export const SLACK_BOT_USERNAME = "bug-triage-bot";

export const MAX_CLARIFICATION_ROUNDS = 5;

export const DOMAIN_DOCS_DIR = "docs/domain";

export const INTENT_KINDS = {
  bug: "bug",
  question: "question",
  featureRequest: "feature_request",
} as const;

export type IntentKind = (typeof INTENT_KINDS)[keyof typeof INTENT_KINDS];

export const LINEAR_AGENT_LABEL = "agent";

export const LINEAR_FEATURE_LABEL = "feature";

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

/**
 * Slack reply posted when answer generation fails for a question (EC2). The bot
 * stays subscribed, so it invites the user to retry or file an issue.
 */
export const ANSWER_FAILED_MESSAGE =
  "I couldn't generate an answer to your question. I'm still monitoring this thread, " +
  "so feel free to ask again or file an issue if you encounter a bug.";

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

export const INTENT_CLASSIFY_SYSTEM_PROMPT = `
You are a message classifier. Analyze the most recent message in the conversation and determine the user's intent.

Classify as one of:
- "question": User is asking how something works or requesting information/clarification (not reporting a bug or requesting a feature).
- "bug": User is reporting a problem, defect, or unexpected behaviour.
- "feature_request": User is requesting a new capability or improvement to the product.

Bias towards "bug" or "feature_request" when actionable detail is present. When in doubt about distinguishing question from other intents, prefer the one most likely based on the context and tone.
`.trim();

export const QUESTION_ANSWER_SYSTEM_PROMPT = `
You are a helpful assistant answering questions about the product.

Provide a clear, concise answer that directly addresses the user's question. You may cite domain documentation if relevant, but general product knowledge is also acceptable. Keep your answer practical and actionable.
`.trim();

export const FEATURE_EVALUATE_SYSTEM_PROMPT = `
You are a feature request evaluator. Assess whether the feature request is complete and actionable.

Consider whether the request includes:
1. A clear description of what the user wants
2. The motivation or problem it solves
3. Any relevant context about the use case

If the request lacks critical detail: set isComplete to false and provide ONE focused clarifying question.
If the request is sufficiently detailed: set isComplete to true and clarifyingQuestion to null.
`.trim();

export const FEATURE_FORMAT_SYSTEM_PROMPT = `
You are a feature request formatter. Given the conversation, produce:
- title: a concise one-line summary of the feature request (max 80 chars)
- description: a well-structured markdown description with these sections:
  ## Summary
  ## Problem / Motivation
  ## Proposed Solution
  ## Use Cases
`.trim();
