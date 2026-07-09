import { Injectable } from "@nestjs/common";
import type { PublicSchema } from "@mastra/core/schema";
import type { ModelMessage } from "ai";
import type { Message } from "chat";
import {
  questionAnswerAgent,
  AnswerSchema,
  type Answer,
} from "@/slack-bug-intake/agent/question-answer.agent";

@Injectable()
export class AnswerQuestionQuery {
  async execute(recentMessages: Message[]): Promise<Answer> {
    const messages: ModelMessage[] = recentMessages.map((m) => ({
      role: m.author.isMe ? "assistant" : "user",
      content: m.text,
    })) as ModelMessage[];

    // System prompt is resolved by the agent from Langfuse (with local fallback).
    // Cast bridges the zod v4 schema to Mastra's PublicSchema type (dual-zod
    // typing mismatch); the schema is structurally valid at runtime.
    const { object } = await questionAnswerAgent.generate(messages, {
      structuredOutput: { schema: AnswerSchema as unknown as PublicSchema<Answer> },
    });

    return object;
  }
}
