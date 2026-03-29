export const SLACK_BOT_USERNAME = "bug-triage-bot";

export const MAX_CLARIFICATION_ROUNDS = 5;

export const LINEAR_AGENT_LABEL = "agent";

export const FALLBACK_MESSAGE =
  "I wasn't able to gather all the details I need. " +
  "Please file the issue directly in Linear with as much detail as possible.";

export const TRIAGE_SYSTEM_PROMPT = `
You are a bug triage assistant. Evaluate whether the conversation contains:
1. A clear summary of the problem
2. Steps to reproduce
3. Expected behaviour
4. Actual behaviour
5. Environment information (OS, browser, version)

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
