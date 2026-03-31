import { Injectable, Inject, type OnModuleInit } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { Thread } from "chat";
import { SlackTransfer } from "@/transfer/slack.transfer";
import { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import {
  MAX_CLARIFICATION_ROUNDS,
  FALLBACK_MESSAGE,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { dispatchWebhook } from "@/util/webhook-adapter";

@Injectable()
export class SlackBotCoordinator implements OnModuleInit {
  constructor(
    @Inject(SlackTransfer) private readonly slackTransfer: SlackTransfer,
    @Inject(EvaluateBugReportQuery) private readonly evaluateBugReport: EvaluateBugReportQuery,
    @Inject(CreateLinearIssueCommand) private readonly createLinearIssue: CreateLinearIssueCommand,
  ) {}

  onModuleInit(): void {
    this.slackTransfer.onNewMention(async (thread, _message) => {
      await thread.subscribe();
      await this.handleIncoming(thread);
    });

    this.slackTransfer.onSubscribedMessage(async (thread, _message) => {
      await this.handleIncoming(thread);
    });
  }

  private async handleIncoming(thread: Thread): Promise<void> {
    await thread.refresh();
    const { isComplete, clarifyingQuestion } = await this.evaluateBugReport.execute(
      thread.recentMessages,
    );
    const botTurns = thread.recentMessages.filter((m) => m.author.isMe).length;

    if (isComplete) {
      const { url } = await this.createLinearIssue.execute(thread.recentMessages);
      await thread.post(`Linear issue created: ${url}`);
      await thread.unsubscribe();
    } else if (botTurns < MAX_CLARIFICATION_ROUNDS && clarifyingQuestion !== null) {
      await thread.post(clarifyingQuestion);
    } else {
      await thread.post(FALLBACK_MESSAGE);
      await thread.unsubscribe();
    }
  }

  async handleWebhook(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    await dispatchWebhook(req, res, (request) => this.slackTransfer.chat.webhooks.slack(request));
  }
}
