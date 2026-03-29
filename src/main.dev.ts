/**
 * Dev-only startup — skips syncAllRepos() for local API testing.
 * Run: npm run dev:server  (loads .env automatically)
 */
import "reflect-metadata";
import { validateEnv, createApp } from "@/create-app";
import { logger } from "@/util/logger";
import { WEBHOOK_PORT } from "@/repos.config";

async function bootstrap(): Promise<void> {
  validateEnv();
  logger.info("🧪 [DEV] Starting webhook server (repo sync skipped)");

  const app = await createApp();
  await app.listen(WEBHOOK_PORT);
  logger.info(`✅ Webhook server on port ${WEBHOOK_PORT}`);
  logger.info(`   POST /webhook`);
  logger.info(`   GET  /health`);
}

bootstrap().catch((err: Error) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
