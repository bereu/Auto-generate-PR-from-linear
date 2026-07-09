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

export const WORKFLOW_ERROR_MESSAGE =
  "Something went wrong while processing your bug report. " +
  "Our team has been notified. Please try again shortly or file the issue directly in Linear.";

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
