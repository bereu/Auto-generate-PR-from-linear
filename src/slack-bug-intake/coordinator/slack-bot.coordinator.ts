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
import { webhookAdapter } from "@/util/webhook-adapter";
import { logger } from "@/util/logger";

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
    try {
      await thread.refresh();
      const { isComplete, clarifyingQuestion } = await this.evaluateBugReport.execute(
        thread.recentMessages,
      );
      const botTurns = thread.recentMessages.filter((m) => m.author.isMe).length;
      logger.info(
        `[slack-triage] evaluated: isComplete=${isComplete} hasQuestion=${clarifyingQuestion !== null} botTurns=${botTurns} messages=${thread.recentMessages.length}`,
      );

      if (isComplete) {
        const { url } = await this.createLinearIssue.execute(thread.recentMessages);
        logger.info(`[slack-triage] Linear issue created: ${url}`);
        await thread.post(`Linear issue created: ${url}`);
        await thread.unsubscribe();
      } else if (botTurns < MAX_CLARIFICATION_ROUNDS && clarifyingQuestion !== null) {
        logger.info(`[slack-triage] posting clarifying question`);
        await thread.post(clarifyingQuestion);
      } else {
        logger.info(
          `[slack-triage] rounds exhausted or no question — posting fallback and unsubscribing`,
        );
        await thread.post(FALLBACK_MESSAGE);
        await thread.unsubscribe();
      }
    } catch (err) {
      // BE-003: do not swallow system errors without logging.
      logger.error(
        `[slack-triage] handleIncoming failed: ${(err as Error).message}\n${(err as Error).stack ?? ""}`,
      );
    }
  }

  async handleWebhook(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    await webhookAdapter.dispatch(req, res, (request) =>
      this.slackTransfer.chat.webhooks.slack(request),
    );
  }
}
