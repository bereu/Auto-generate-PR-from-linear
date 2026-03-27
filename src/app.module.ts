import { Module } from "@nestjs/common";
import { WebhookModule } from "./webhook/webhook.module.ts";

@Module({
  imports: [WebhookModule],
})
export class AppModule {}
