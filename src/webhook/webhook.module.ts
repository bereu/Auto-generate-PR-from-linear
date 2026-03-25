import { Module } from "@nestjs/common";
import { WebhookController } from "./webhook.controller.js";
import { WebhookService } from "./webhook.service.js";

@Module({
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
