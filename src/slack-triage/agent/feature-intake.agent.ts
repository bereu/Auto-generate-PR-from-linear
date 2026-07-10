import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AGENT_NAMES, AGENT_MODELS } from "@/constants/mastra.constants";
import { langfuse } from "@/util/langfuse";
import { domainDocsWorkspace } from "@/slack-triage/agent/domain-docs.workspace";

/**
 * Structured output contract for the feature-intake agent.
 * Evaluates feature request completeness (shared with bug evaluation schema).
 */
export const FeatureEvaluationSchema = z.object({
  isComplete: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
});

export type FeatureEvaluation = z.infer<typeof FeatureEvaluationSchema>;

/**
 * Feature-intake Mastra agent.
 *
 * `instructions` are resolved dynamically from Langfuse on every run, so the
 * system prompt can be edited/versioned in Langfuse without a redeploy. Falls
 * back to the local prompt when Langfuse is unreachable.
 *
 * Has workspace access so it can consult domain docs while evaluating feature requests.
 * Tool-capable — will use list/read/search file tools automatically.
 */
export const featureIntakeAgent = new Agent({
  id: AGENT_NAMES.featureIntake,
  name: AGENT_NAMES.featureIntake,
  instructions: async () => langfuse.fetchFeatureEvaluatePrompt(),
  model: anthropic(AGENT_MODELS.featureIntake),
  workspace: domainDocsWorkspace,
});
