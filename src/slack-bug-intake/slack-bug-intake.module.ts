import { Module } from "@nestjs/common";
import { SlackBotCoordinator } from "@/slack-bug-intake/coordinator/slack-bot.coordinator";
import { SlackEventsController } from "@/slack-bug-intake/controller/slack-events.controller";
import { ClassifyMessageQuery } from "@/slack-bug-intake/query/classify-message.query";
import { AnswerQuestionQuery } from "@/slack-bug-intake/query/answer-question.query";
import { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import { EvaluateFeatureRequestQuery } from "@/slack-bug-intake/query/evaluate-feature-request.query";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
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
export class SlackBugIntakeModule {}
