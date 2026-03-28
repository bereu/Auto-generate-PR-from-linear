import "reflect-metadata";
import { validateEnv, createApp } from "@/create-app";
import { syncAllRepos } from "@/sync-repos";
import { logger } from "@/logger";
import { WEBHOOK_PORT } from "@/repos.config";

async function bootstrap(): Promise<void> {
  logger.info("🚀 Claude Linear Agent starting...");

  validateEnv();

  const { failed } = await syncAllRepos();
  if (failed.length > 0) {
    logger.warn(
      `⚠️  ${failed.length} repo(s) failed to sync: ${failed.map((f) => f.name).join(", ")}`,
    );
  }

  const app = await createApp();
  await app.listen(WEBHOOK_PORT);
  logger.info(`✅ Webhook server listening on port ${WEBHOOK_PORT}`);
  logger.info(`   POST /webhook — receive Linear events`);
  logger.info(`   GET  /health  — health check`);
}

bootstrap().catch((err: Error) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
