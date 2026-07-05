import { Injectable, Inject } from "@nestjs/common";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Message } from "chat";
import { BugReport } from "@/domain/bug-report/bug-report";
import { LinearTransfer } from "@/transfer/linear.transfer";
import {
  LINEAR_AGENT_LABEL,
  DIFFICULTY_LABELS,
  type DifficultyLabel,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { LINEAR_STATES } from "@/repos.config";
import { langfuse } from "@/util/langfuse";
import { AGENT_MODELS } from "@/constants/mastra.constants";

const FormatSchema = z.object({
  title: z.string(),
  description: z.string(),
});

@Injectable()
export class CreateLinearIssueCommand {
  constructor(@Inject(LinearTransfer) private readonly linearTransfer: LinearTransfer) {}

  async execute(recentMessages: Message[], difficulty?: DifficultyLabel): Promise<{ url: string }> {
    const messages = recentMessages.map((m) => ({
      role: (m.author.isMe ? "assistant" : "user") as "user" | "assistant",
      content: m.text,
    }));

    const { object } = await generateObject({
      model: anthropic(AGENT_MODELS.bugTriage),
      system: await langfuse.fetchFormatPrompt(),
      messages,
      schema: FormatSchema,
    });

    const bugReport = BugReport.create(object.title, object.description);

    // Build label names: always include agent label; optionally add difficulty.
    const labelNames = [LINEAR_AGENT_LABEL];
    if (difficulty && difficulty in DIFFICULTY_LABELS) {
      labelNames.push(difficulty);
    }

    return this.linearTransfer.createIssue({
      title: bugReport.title(),
      description: bugReport.description(),
      labelNames,
      stateName: LINEAR_STATES.todo,
    });
  }
}
