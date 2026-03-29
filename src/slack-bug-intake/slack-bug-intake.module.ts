import { Module } from "@nestjs/common";
import { SlackBotService } from "@/slack-bug-intake/slack-bot.service";
import { SlackEventsController } from "@/slack-bug-intake/controller/slack-events.controller";
import { EvaluateBugReportCommand } from "@/slack-bug-intake/command/evaluate-bug-report.command";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { LinearTransfer } from "@/transfer/linear.transfer";

@Module({
  controllers: [SlackEventsController],
  providers: [SlackBotService, EvaluateBugReportCommand, CreateLinearIssueCommand, LinearTransfer],
})
export class SlackBugIntakeModule {}
