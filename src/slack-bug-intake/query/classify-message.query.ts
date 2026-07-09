import { Injectable } from "@nestjs/common";
import type { PublicSchema } from "@mastra/core/schema";
import type { ModelMessage } from "ai";
import type { Message } from "chat";
import {
  intentClassifierAgent,
  IntentSchema,
  type Intent,
} from "@/slack-bug-intake/agent/intent-classifier.agent";

@Injectable()
export class ClassifyMessageQuery {
  async execute(recentMessages: Message[]): Promise<Intent> {
    const messages: ModelMessage[] = recentMessages.map((m) => ({
      role: m.author.isMe ? "assistant" : "user",
      content: m.text,
    })) as ModelMessage[];

    // System prompt is resolved by the agent from Langfuse (with local fallback).
    // Cast bridges the zod v4 schema to Mastra's PublicSchema type (dual-zod
    // typing mismatch); the schema is structurally valid at runtime.
    const { object } = await intentClassifierAgent.generate(messages, {
      structuredOutput: { schema: IntentSchema as unknown as PublicSchema<Intent> },
    });

    return object;
  }
}
