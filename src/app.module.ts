import { Module } from "@nestjs/common";
import { LinearWebhookModule } from "@/linear-webhook/linear-webhook.module";
import { SlackTriageModule } from "@/slack-triage/slack-triage.module";

// NOTE: The triage agent is implemented via Claude Agent SDK `query()` sessions
// in the Coordinator layer (SlackBotCoordinator), not as an HTTP service.
// All Slack I/O goes through the Chat SDK (bot token integration).
// Linear issue creation uses the official Linear MCP server (HTTP/SSE endpoint).
// No additional HTTP modules are registered at the app level.
@Module({
  imports: [LinearWebhookModule, SlackTriageModule],
})
export class AppModule {}
