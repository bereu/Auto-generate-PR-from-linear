import { Injectable, Inject, type OnModuleInit } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { Thread } from "chat";
import { RequestContext } from "@mastra/core/request-context";
import { SlackTransfer } from "@/transfer/slack.transfer";
import { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { WORKFLOW_NAMES } from "@/constants/mastra.constants";
import { mastra } from "@/util/mastra";
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

      // Build Mastra request context with dependencies needed by workflow steps.
      // RequestContext is a Map-like container; pass tuples in constructor.
      const requestContext = new RequestContext<{
        thread: Thread;
        evaluateBugReport: EvaluateBugReportQuery;
        createLinearIssue: CreateLinearIssueCommand;
      }>([
        ["thread", thread],
        ["evaluateBugReport", this.evaluateBugReport],
        ["createLinearIssue", this.createLinearIssue],
      ]);

      // Start the bug triage workflow with the injected context.
      const workflow = mastra.getWorkflow(WORKFLOW_NAMES.bugTriage);
      const run = await workflow.createRun();
      await run.start({
        inputData: {},
        requestContext,
      });
    } catch (err) {
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
