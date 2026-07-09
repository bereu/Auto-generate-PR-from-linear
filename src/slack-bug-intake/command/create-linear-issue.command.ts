import { Injectable, Inject } from "@nestjs/common";
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Message } from "chat";
import { BugReport } from "@/domain/bug-report/bug-report";
import { LinearTransfer } from "@/transfer/linear.transfer";
import {
  LINEAR_AGENT_LABEL,
  LINEAR_FEATURE_LABEL,
  DIFFICULTY_LABELS,
  INTENT_KINDS,
  type DifficultyLabel,
  type IntentKind,
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

  async execute(
    recentMessages: Message[],
    difficulty?: DifficultyLabel,
    kind?: IntentKind,
  ): Promise<{ url: string }> {
    const messages = recentMessages.map((m) => ({
      role: (m.author.isMe ? "assistant" : "user") as "user" | "assistant",
      content: m.text,
    }));

    const systemPrompt = await this.selectSystemPrompt(kind);

    const { object } = await generateObject({
      model: anthropic(AGENT_MODELS.bugTriage),
      system: systemPrompt,
      messages,
      schema: FormatSchema,
    });

    const bugReport = BugReport.create(object.title, object.description);
    const labelNames = this.buildLabelNames(kind, difficulty);

    return this.linearTransfer.createIssue({
      title: bugReport.title(),
      description: bugReport.description(),
      labelNames,
      stateName: LINEAR_STATES.todo,
    });
  }

  private async selectSystemPrompt(kind?: IntentKind): Promise<string> {
    return kind === INTENT_KINDS.featureRequest
      ? await langfuse.fetchFeatureFormatPrompt()
      : await langfuse.fetchFormatPrompt();
  }

  private buildLabelNames(kind?: IntentKind, difficulty?: DifficultyLabel): string[] {
    const labelNames = [LINEAR_AGENT_LABEL];
    if (kind === INTENT_KINDS.featureRequest) {
      labelNames.push(LINEAR_FEATURE_LABEL);
    }
    if (difficulty && difficulty in DIFFICULTY_LABELS) {
      labelNames.push(difficulty);
    }
    return labelNames;
  }
}
