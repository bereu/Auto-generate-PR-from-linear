import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AGENT_NAMES, AGENT_MODELS } from "@/constants/mastra.constants";
import { langfuse } from "@/util/langfuse";
import { domainDocsWorkspace } from "@/slack-bug-intake/agent/domain-docs.workspace";

/**
 * Structured output contract for the question-answer agent.
 * Generates an answer to a user's question.
 */
export const AnswerSchema = z.object({
  answer: z.string(),
});

export type Answer = z.infer<typeof AnswerSchema>;

/**
 * Question-answer Mastra agent.
 *
 * `instructions` are resolved dynamically from Langfuse on every run, so the
 * system prompt can be edited/versioned in Langfuse without a redeploy. Falls
 * back to the local prompt when Langfuse is unreachable.
 *
 * Has workspace access so it can consult domain docs while answering questions.
 * Tool-capable — will use list/read/search file tools automatically.
 */
export const questionAnswerAgent = new Agent({
  id: AGENT_NAMES.questionAnswer,
  name: AGENT_NAMES.questionAnswer,
  instructions: async () => langfuse.fetchQuestionAnswerPrompt(),
  model: anthropic(AGENT_MODELS.questionAnswer),
  workspace: domainDocsWorkspace,
});
