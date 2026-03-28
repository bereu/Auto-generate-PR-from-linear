import { Module } from "@nestjs/common";
import { LinearWebhookController } from "@/linear-webhook/controller/linear-webhook.controller";
import { ImplementIssueCommand } from "@/linear-webhook/command/implement-issue.command";

@Module({
  controllers: [LinearWebhookController],
  providers: [ImplementIssueCommand],
})
export class LinearWebhookModule {}
