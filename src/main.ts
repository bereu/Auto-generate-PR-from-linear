import "reflect-metadata";
import { validateEnv, createApp } from "@/create-app";
import { syncAllRepos } from "@/sync-repos";
import { logger } from "@/util/logger";
import { WEBHOOK_PORT } from "@/repos.config";
import { mastra } from "@/util/mastra";

const NO_FAILURES = 0;
const EXIT_CODE_SUCCESS = 0;
const EXIT_CODE_ERROR = 1;

/**
 * Graceful shutdown handler: flushes Mastra observability traces to Langfuse
 * before the process exits, preventing loss of short-lived request spans.
 * If observability is disabled (env vars not set), shutdown() is a no-op.
 */
async function handleShutdown(signal: string): Promise<void> {
  logger.debug(`Received ${signal}, flushing observability traces...`);
  try {
    await mastra.observability.shutdown();
  } catch (err) {
    logger.warn("[shutdown] Failed to flush observability", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
  process.exit(EXIT_CODE_SUCCESS);
}

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

  // Register graceful shutdown handlers to flush observability traces
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
  process.on("SIGINT", () => handleShutdown("SIGINT"));
}

bootstrap().catch((err: Error) => {
  logger.critical(err);
  process.exit(EXIT_CODE_ERROR);
});
