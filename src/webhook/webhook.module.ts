import { Module } from "@nestjs/common";
import { WebhookController } from "./webhook.controller.ts";
import { IssueEventService } from "./webhook.service.ts";
import { ImplementIssueCommand } from "@/issue/command/implement-issue.command.ts";

@Module({
  controllers: [WebhookController],
  providers: [IssueEventService, ImplementIssueCommand],
})
export class WebhookModule {}
