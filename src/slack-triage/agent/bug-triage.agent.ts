import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AGENT_NAMES, AGENT_MODELS } from "@/constants/mastra.constants";
import { langfuse } from "@/util/langfuse";
import { domainDocsWorkspace } from "@/slack-triage/agent/domain-docs.workspace";

/**
 * Structured output contract for the bug-triage agent.
 * Shared with the Query layer so the return shape stays authoritative.
 */
export const EvaluationSchema = z.object({
  isComplete: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
});

export type Evaluation = z.infer<typeof EvaluationSchema>;

/**
 * Bug-triage Mastra agent.
 *
 * `instructions` are resolved dynamically from Langfuse on every run, so the
 * system prompt can be edited/versioned in Langfuse without a redeploy. Falls
 * back to the local prompt when Langfuse is unreachable (see `langfuse` util).
 *
 * Pure classifier — no tools. Slack/Linear side effects stay in the Coordinator.
 */
export const bugTriageAgent = new Agent({
  id: AGENT_NAMES.bugTriage,
  name: AGENT_NAMES.bugTriage,
  instructions: async () => langfuse.fetchTriagePrompt(),
  model: anthropic(AGENT_MODELS.bugTriage),
  workspace: domainDocsWorkspace,
});
