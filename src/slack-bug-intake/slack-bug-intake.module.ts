import { Module } from "@nestjs/common";
import { SlackBotCoordinator } from "@/slack-bug-intake/coordinator/slack-bot.coordinator";
import { SlackEventsController } from "@/slack-bug-intake/controller/slack-events.controller";
import { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { LinearTransfer } from "@/transfer/linear.transfer";

@Module({
  controllers: [SlackEventsController],
  providers: [
    SlackBotCoordinator,
    EvaluateBugReportQuery,
    CreateLinearIssueCommand,
    LinearTransfer,
  ],
})
export class SlackBugIntakeModule {}
