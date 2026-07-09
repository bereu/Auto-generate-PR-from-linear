import { Injectable } from "@nestjs/common";
import type { PublicSchema } from "@mastra/core/schema";
import type { ModelMessage } from "ai";
import type { Message } from "chat";
import {
  featureIntakeAgent,
  FeatureEvaluationSchema,
  type FeatureEvaluation,
} from "@/slack-bug-intake/agent/feature-intake.agent";

@Injectable()
export class EvaluateFeatureRequestQuery {
  async execute(recentMessages: Message[]): Promise<{
    isComplete: boolean;
    clarifyingQuestion: string | null;
  }> {
    const messages: ModelMessage[] = recentMessages.map((m) => ({
      role: m.author.isMe ? "assistant" : "user",
      content: m.text,
    })) as ModelMessage[];

    // System prompt is resolved by the agent from Langfuse (with local fallback).
    // Cast bridges the zod v4 schema to Mastra's PublicSchema type (dual-zod
    // typing mismatch); the schema is structurally valid at runtime.
    const { object } = await featureIntakeAgent.generate(messages, {
      structuredOutput: {
        schema: FeatureEvaluationSchema as unknown as PublicSchema<FeatureEvaluation>,
      },
    });

    return object;
  }
}
