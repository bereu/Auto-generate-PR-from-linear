import { Module } from "@nestjs/common";
import { SlackBotCoordinator } from "@/slack-triage/coordinator/slack-bot.coordinator";
import { SlackEventsController } from "@/slack-triage/controller/slack-events.controller";
import { ClassifyMessageQuery } from "@/slack-triage/query/classify-message.query";
import { AnswerQuestionQuery } from "@/slack-triage/query/answer-question.query";
import { EvaluateBugReportQuery } from "@/slack-triage/query/evaluate-bug-report.query";
import { EvaluateFeatureRequestQuery } from "@/slack-triage/query/evaluate-feature-request.query";
import { CreateLinearIssueCommand } from "@/slack-triage/command/create-linear-issue.command";
import { LinearTransfer } from "@/transfer/linear.transfer";
import { SlackTransfer } from "@/transfer/slack.transfer";

@Module({
  controllers: [SlackEventsController],
  providers: [
    SlackBotCoordinator,
    ClassifyMessageQuery,
    AnswerQuestionQuery,
    EvaluateBugReportQuery,
    EvaluateFeatureRequestQuery,
    CreateLinearIssueCommand,
    LinearTransfer,
    SlackTransfer,
  ],
})
export class SlackTriageModule {}
