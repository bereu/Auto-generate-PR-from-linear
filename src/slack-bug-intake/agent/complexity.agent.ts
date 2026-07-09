import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AGENT_NAMES, AGENT_MODELS } from "@/constants/mastra.constants";
import { langfuse } from "@/util/langfuse";
import { domainDocsWorkspace } from "@/slack-bug-intake/agent/domain-docs.workspace";

/**
 * Structured output contract for the complexity-assessment agent.
 * Shared with the workflow so the return shape stays authoritative.
 */
export const DifficultySchema = z.enum(["easy", "medium", "hard"]);

export type Difficulty = z.infer<typeof DifficultySchema>;

/**
 * Complexity assessment Mastra agent.
 *
 * `instructions` are resolved dynamically from Langfuse on every run, so the
 * system prompt can be edited/versioned in Langfuse without a redeploy. Falls
 * back to the local prompt when Langfuse is unreachable.
 *
 * Has workspace access so it can consult domain docs while assessing difficulty.
 * Tool-capable — will use list/read/search file tools automatically.
 */
export const complexityAgent = new Agent({
  id: AGENT_NAMES.complexity,
  name: AGENT_NAMES.complexity,
  instructions: async () => langfuse.fetchComplexityPrompt(),
  model: anthropic(AGENT_MODELS.complexity),
  workspace: domainDocsWorkspace,
});
