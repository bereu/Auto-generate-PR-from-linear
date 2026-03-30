import { Injectable, Inject } from "@nestjs/common";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Message } from "chat";
import { BugReport } from "@/domain/bug-report/bug-report";
import { LinearTransfer } from "@/transfer/linear.transfer";
import {
  FORMAT_SYSTEM_PROMPT,
  LINEAR_AGENT_LABEL,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { LINEAR_STATES } from "@/repos.config";

const FormatSchema = z.object({
  title: z.string(),
  description: z.string(),
});

@Injectable()
export class CreateLinearIssueCommand {
  constructor(@Inject(LinearTransfer) private readonly linearTransfer: LinearTransfer) {}

  async execute(recentMessages: Message[]): Promise<{ url: string }> {
    const messages = recentMessages.map((m) => ({
      role: (m.author.isMe ? "assistant" : "user") as "user" | "assistant",
      content: m.text,
    }));

    const { object } = await generateObject({
      model: anthropic("claude-haiku-4-5-20251001"),
      system: FORMAT_SYSTEM_PROMPT,
      messages,
      schema: FormatSchema,
    });

    const bugReport = BugReport.create(object.title, object.description);
    return this.linearTransfer.createIssue({
      title: bugReport.title(),
      description: bugReport.description(),
      labelNames: [LINEAR_AGENT_LABEL],
      stateName: LINEAR_STATES.todo,
    });
  }
}
