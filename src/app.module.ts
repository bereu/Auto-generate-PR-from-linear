import { Module } from "@nestjs/common";
import { LinearWebhookModule } from "@/linear-webhook/linear-webhook.module";
import { SlackBugIntakeModule } from "@/slack-bug-intake/slack-bug-intake.module";

@Module({
  imports: [LinearWebhookModule, SlackBugIntakeModule],
})
export class AppModule {}
