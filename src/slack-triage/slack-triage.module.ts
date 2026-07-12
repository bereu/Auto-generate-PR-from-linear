import { Module } from "@nestjs/common";
import { SlackBotCoordinator } from "@/slack-triage/coordinator/slack-bot.coordinator";
import { SlackEventsController } from "@/slack-triage/controller/slack-events.controller";
import { TriageAgent } from "@/slack-triage/agent/triage.agent";
import { ReconcileLinearIssueCommand } from "@/slack-triage/command/reconcile-linear-issue.command";
import { LinearTransfer } from "@/transfer/linear.transfer";
import { SlackTransfer } from "@/transfer/slack.transfer";

/**
 * SlackTriageModule: runs the Slack triage integration.
 *
 * Key components:
 * - SlackBotCoordinator: orchestrates the triage flow via Chat SDK events
 * - TriageAgent: Claude Agent SDK agentic session (intent classify, clarify, create issue)
 * - ReconcileLinearIssueCommand: enforces agent label + Todo state post-creation
 *
 * Removed (Mastra-replaced):
 * - ClassifyMessageQuery, AnswerQuestionQuery, etc. (subsumed by TriageAgent)
 * - CreateLinearIssueCommand (replaced by MCP tool, reconciliation Command)
 */
@Module({
  controllers: [SlackEventsController],
  providers: [
    SlackBotCoordinator,
    TriageAgent,
    ReconcileLinearIssueCommand,
    LinearTransfer,
    SlackTransfer,
  ],
})
export class SlackTriageModule {}
