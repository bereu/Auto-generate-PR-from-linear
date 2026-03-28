import { Module } from "@nestjs/common";
import { LinearWebhookModule } from "@/linear-webhook/linear-webhook.module";

@Module({
  imports: [LinearWebhookModule],
})
export class AppModule {}
