import "reflect-metadata";
import { validateEnv, createApp } from "@/create-app";
import { syncAllRepos } from "@/sync-repos";
import { logger } from "@/util/logger";
import { WEBHOOK_PORT } from "@/repos.config";

const NO_FAILURES = 0;
const EXIT_CODE_ERROR = 1;

async function bootstrap(): Promise<void> {
  logger.info("🚀 Claude Linear Agent starting...");

  validateEnv();

  const { failed } = await syncAllRepos();
  if (failed.length > NO_FAILURES) {
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
  logger.critical(err);
  process.exit(EXIT_CODE_ERROR);
});
