/**
 * Local integration testing startup.
 * Starts the webhook server + opens a public HTTPS tunnel via localtunnel.
 * Run: npm run dev:local  (loads .env automatically)
 */
import "reflect-metadata";
import localtunnel from "localtunnel";
import { validateEnv, createApp } from "./create-app.js";
import { logger } from "@/logger.js";
import { WEBHOOK_PORT } from "@/repos.config.js";

async function bootstrap(): Promise<void> {
  validateEnv();
  logger.info("🧪 [LOCAL] Starting webhook server (repo sync skipped)");

  const app = await createApp();
  await app.listen(WEBHOOK_PORT);
  logger.info(`✅ Webhook server on port ${WEBHOOK_PORT}`);

  logger.info("🌐 Opening public tunnel...");
  const tunnel = await localtunnel({ port: WEBHOOK_PORT });

  const webhookUrl = `${tunnel.url}/webhook`;
  const secret = process.env.LINEAR_WEBHOOK_SECRET!;

  logger.info(`\n${"─".repeat(54)}`);
  logger.info(`🌐 Public URL: ${tunnel.url}`);
  logger.info(`${"─".repeat(54)}`);
  logger.info(`Register this URL in Linear:`);
  logger.info(`  Settings → API → Webhooks → New Webhook`);
  logger.info(`  URL:    ${webhookUrl}`);
  logger.info(`  Secret: ${secret}`);
  logger.info(`${"─".repeat(54)}\n`);

  tunnel.on("close", () => {
    logger.warn("⚠️  Tunnel closed. Restart dev:local to get a new public URL.");
  });

  const shutdown = (): void => {
    logger.info("Closing tunnel...");
    tunnel.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err: Error) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
