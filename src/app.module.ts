import { Module } from "@nestjs/common";
import { LinearWebhookModule } from "@/linear-webhook/linear-webhook.module";
import { SlackTriageModule } from "@/slack-triage/slack-triage.module";

// NOTE: We deliberately do NOT register `@mastra/nestjs`'s MastraModule. Its
// server adapter installs a catch-all route that shadows the app's own webhook
// endpoints (POST /slack/events, POST /webhook → 404), breaking the core
// pipeline. The Mastra agent is used in-process via the Query layer
// (bugTriageAgent.generate()), so no HTTP module is needed. See docs/mastra-integration.
@Module({
  imports: [LinearWebhookModule, SlackTriageModule],
})
export class AppModule {}
