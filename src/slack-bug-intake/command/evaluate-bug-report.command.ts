import { Injectable } from "@nestjs/common";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Message } from "chat";
import { TRIAGE_SYSTEM_PROMPT } from "@/slack-bug-intake/slack-bug-intake.constants";

const EvaluationSchema = z.object({
  isComplete: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
});

@Injectable()
export class EvaluateBugReportCommand {
  async execute(recentMessages: Message[]): Promise<{
    isComplete: boolean;
    clarifyingQuestion: string | null;
  }> {
    const messages = recentMessages.map((m) => ({
      role: (m.author.isMe ? "assistant" : "user") as "user" | "assistant",
      content: m.text,
    }));

    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: TRIAGE_SYSTEM_PROMPT,
      messages,
      schema: EvaluationSchema,
    });

    return object;
  }
}
