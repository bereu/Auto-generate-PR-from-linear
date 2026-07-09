import { Agent } from "@mastra/core/agent";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { AGENT_NAMES, AGENT_MODELS } from "@/constants/mastra.constants";
import { INTENT_KINDS } from "@/slack-bug-intake/slack-bug-intake.constants";
import { langfuse } from "@/util/langfuse";

/**
 * Structured output contract for the intent-classifier agent.
 * Classifies user messages into one of three intents.
 */
export const IntentSchema = z.object({
  intent: z.enum([INTENT_KINDS.question, INTENT_KINDS.bug, INTENT_KINDS.featureRequest]),
});

export type Intent = z.infer<typeof IntentSchema>;

/**
 * Intent-classifier Mastra agent.
 *
 * `instructions` are resolved dynamically from Langfuse on every run, so the
 * system prompt can be edited/versioned in Langfuse without a redeploy. Falls
 * back to the local prompt when Langfuse is unreachable.
 *
 * Pure classifier — no tools. No workspace access (does not need domain docs).
 */
export const intentClassifierAgent = new Agent({
  id: AGENT_NAMES.intentClassifier,
  name: AGENT_NAMES.intentClassifier,
  instructions: async () => langfuse.fetchIntentClassifyPrompt(),
  model: anthropic(AGENT_MODELS.intentClassifier),
});
