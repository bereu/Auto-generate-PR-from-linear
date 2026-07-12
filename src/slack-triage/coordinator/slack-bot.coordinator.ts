import { Injectable, Inject, type OnModuleInit } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import type { Thread } from "chat";
import { SlackTransfer } from "@/transfer/slack.transfer";
import { TriageAgent } from "@/slack-triage/agent/triage.agent";
import { ReconcileLinearIssueCommand } from "@/slack-triage/command/reconcile-linear-issue.command";
import { classifyTriageError } from "@/slack-triage/triage-error";
import { webhookAdapter } from "@/util/webhook-adapter";
import { logger } from "@/util/logger";
import {
  buildIssueCreatedMessage,
  buildMaxRoundsIssueCreatedMessage,
} from "@/slack-triage/slack-triage.constants";

@Injectable()
export class SlackBotCoordinator implements OnModuleInit {
  constructor(
    @Inject(SlackTransfer) private readonly slackTransfer: SlackTransfer,
    @Inject(TriageAgent) private readonly triageAgent: TriageAgent,
    @Inject(ReconcileLinearIssueCommand)
    private readonly reconcileLinearIssue: ReconcileLinearIssueCommand,
  ) {}

  onModuleInit(): void {
    this.slackTransfer.onNewMention(async (thread, _message) => {
      await thread.subscribe();
      // Run triage asynchronously; don't block the Slack webhook response (3s limit)
      this.handleIncoming(thread).catch((err) => {
        logger.error("[slack-bot-coordinator] Unhandled error in handleIncoming", {
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    });

    this.slackTransfer.onSubscribedMessage(async (thread, _message) => {
      // Run triage asynchronously; don't block the Slack webhook response (3s limit)
      this.handleIncoming(thread).catch((err) => {
        logger.error("[slack-bot-coordinator] Unhandled error in handleIncoming", {
          error: err instanceof Error ? err : new Error(String(err)),
        });
      });
    });
  }

  /**
   * Handle an incoming Slack message: run the triage agent, interpret the outcome,
   * post replies via Chat SDK, manage subscriptions, run reconciliation if needed.
   *
   * Per Slack Events API constraint, the handler must ack within 3 seconds; the actual
   * triage runs asynchronously (see onModuleInit above).
   *
   * Coordinator responsibilities (per BE-001):
   * 1. Assemble the prompt from the thread (delegated to TriageAgent.run)
   * 2. Run the agent and act on the outcome
   * 3. Post via Chat SDK (never MCP)
   * 4. Manage subscribe/unsubscribe (Chat SDK)
   * 5. Run the reconciliation Command to enforce the agent label + Todo state
   */
  private async handleIncoming(thread: Thread): Promise<void> {
    try {
      await thread.refresh();
      const outcome = await this.triageAgent.run(thread);
      await this.actOnTriageOutcome(thread, outcome);
    } catch (err) {
      await this.reportFailure(thread, err as Error);
    }
  }

  /**
   * Act on the triage outcome: post messages, manage subscriptions, reconcile issues.
   */
  private async actOnTriageOutcome(
    thread: Thread,
    outcome: Awaited<ReturnType<typeof this.triageAgent.run>>,
  ): Promise<void> {
    switch (outcome.action) {
      case "answered_question":
        await this.handleAnsweredQuestion(thread, outcome);
        break;
      case "asked_clarifying_question":
        await this.handleClarifyingQuestion(thread, outcome);
        break;
      case "created_issue":
        await this.handleCreatedIssue(thread, outcome);
        break;
      case "error":
        await this.handleTriageError(thread, outcome);
        break;
      default:
        logger.warn("[slack-bot-coordinator] Unknown action in triage outcome");
    }
  }

  /**
   * Handle answered_question outcome: post and stay subscribed.
   */
  private async handleAnsweredQuestion(
    thread: Thread,
    outcome: Awaited<ReturnType<typeof this.triageAgent.run>>,
  ): Promise<void> {
    await thread.post(outcome.message);
    logger.info("[slack-bot-coordinator] Answer posted; thread remains subscribed");
  }

  /**
   * Handle asked_clarifying_question outcome: post question and stay subscribed.
   */
  private async handleClarifyingQuestion(
    thread: Thread,
    outcome: Awaited<ReturnType<typeof this.triageAgent.run>>,
  ): Promise<void> {
    await thread.post(outcome.message);
    logger.info("[slack-bot-coordinator] Clarifying question posted; awaiting response");
  }

  /**
   * Handle created_issue outcome: reconcile, post, and unsubscribe.
   */
  private async handleCreatedIssue(
    thread: Thread,
    outcome: Awaited<ReturnType<typeof this.triageAgent.run>>,
  ): Promise<void> {
    if (!outcome.issueId) {
      return;
    }

    try {
      await this.reconcileLinearIssue.execute(outcome.issueId);
    } catch (reconcileErr) {
      logger.error("[slack-bot-coordinator] Reconciliation failed", {
        error: reconcileErr instanceof Error ? reconcileErr : new Error(String(reconcileErr)),
      });
    }

    const message = buildIssueCreatedMessage(outcome.issueUrl ?? "");
    await thread.post(message);
    await thread.unsubscribe();
    logger.info(
      `[slack-bot-coordinator] Issue ${outcome.issueId} created and reconciled; thread unsubscribed`,
    );
  }

  /**
   * Handle error outcome: check if max rounds or real error.
   */
  private async handleTriageError(
    thread: Thread,
    outcome: Awaited<ReturnType<typeof this.triageAgent.run>>,
  ): Promise<void> {
    if (outcome.maxRoundsReached) {
      const message = buildMaxRoundsIssueCreatedMessage(outcome.issueUrl ?? "");
      await thread.post(message);
      await thread.unsubscribe();
      logger.warn("[slack-bot-coordinator] Max clarification rounds reached; thread unsubscribed");
    } else {
      throw new Error(outcome.message);
    }
  }

  /**
   * Report a triage failure through the logger util and best-effort notify the
   * reporter in-thread so they are not left hanging. The error is classified into
   * a pattern (see `classifyTriageError`) which selects both the user-facing reply
   * and the Rollbar severity (BE-003: business logic error → `warn`, system error
   * → `error`). A post failure here must not mask the original error.
   */
  private async reportFailure(thread: Thread, error: Error): Promise<void> {
    const { message, isBusinessError } = classifyTriageError(error);
    const logMessage = `[slack-triage] handleIncoming failed: ${error.message}`;
    if (isBusinessError) {
      logger.warn(logMessage, { error });
    } else {
      logger.error(logMessage, { error });
    }
    try {
      await thread.post(message);
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
