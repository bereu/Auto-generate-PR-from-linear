import { Injectable, Inject, type OnModuleInit } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { Thread } from "chat";
import { RequestContext } from "@mastra/core/request-context";
import { SlackTransfer } from "@/transfer/slack.transfer";
import { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { WORKFLOW_NAMES } from "@/constants/mastra.constants";
import { WORKFLOW_ERROR_MESSAGE } from "@/slack-bug-intake/slack-bug-intake.constants";
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
      const result = await run.start({
        inputData: {},
        requestContext,
      });

      // Mastra does not throw on step failure — it resolves with a `failed`
      // status and an `error` payload. Surface it so the catch block reports it
      // (BE-003) and notifies the user, instead of silently succeeding.
      if (result.status === "failed") {
        throw result.error ?? new Error("Bug triage workflow returned a failed status");
      }
    } catch (err) {
      await this.reportFailure(thread, err as Error);
    }
  }

  /**
   * Report a triage failure through the logger util (BE-003, system error →
   * Rollbar `error`) and best-effort notify the reporter in-thread so they are
   * not left hanging. A post failure here must not mask the original error.
   */
  private async reportFailure(thread: Thread, error: Error): Promise<void> {
    logger.error(`[slack-triage] handleIncoming failed: ${error.message}`, { error });
    try {
      await thread.post(WORKFLOW_ERROR_MESSAGE);
    } catch (postErr) {
      logger.error(
        `[slack-triage] failed to post error notification: ${(postErr as Error).message}`,
        { error: postErr as Error },
      );
    }
  }

  async handleWebhook(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    await webhookAdapter.dispatch(req, res, (request) =>
      this.slackTransfer.chat.webhooks.slack(request),
    );
  }
}
