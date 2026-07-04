/**
 * Local integration testing startup.
 * Starts the webhook server + opens a public HTTPS tunnel via localtunnel.
 * Run: npm run dev:local  (loads .env automatically)
 */
import "reflect-metadata";
import localtunnel from "localtunnel";
import { validateEnv, createApp } from "@/create-app";
import { logger } from "@/util/logger";
import { WEBHOOK_PORT } from "@/repos.config";

/**
 * Reads the requested localtunnel subdomain from `--subdomain <name>` (CLI arg)
 * or the `LOCALTUNNEL_SUBDOMAIN` env var. A fixed subdomain keeps the public URL
 * stable across restarts so Slack/Linear Request URLs don't need re-updating
 * (see docs/adr/GEN-003). The subdomain is best-effort: if it is already taken
 * on loca.lt, localtunnel falls back to a random URL.
 */
function resolveSubdomain(): string | undefined {
  const idx = process.argv.indexOf("--subdomain");
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env.LOCALTUNNEL_SUBDOMAIN ?? undefined;
}

async function openTunnel(subdomain?: string): Promise<Awaited<ReturnType<typeof localtunnel>>> {
  logger.info(
    subdomain
      ? `🌐 Opening public tunnel (subdomain: ${subdomain})...`
      : "🌐 Opening public tunnel (random subdomain)...",
  );
  return localtunnel({ port: WEBHOOK_PORT, subdomain });
}

function warnIfSubdomainChanged(
  subdomain: string | undefined,
  tunnel: Awaited<ReturnType<typeof localtunnel>>,
): void {
  if (subdomain && !tunnel.url.includes(`//${subdomain}.`)) {
    logger.warn(
      `⚠️  Requested subdomain "${subdomain}" was unavailable — got a RANDOM URL instead. ` +
        `Use the Public URL below (not the requested subdomain) and update your Slack/Linear webhooks.`,
    );
  }
}

function logTunnelInfo(tunnel: Awaited<ReturnType<typeof localtunnel>>, secret: string): void {
  const webhookUrl = `${tunnel.url}/webhook`;
  const slackUrl = `${tunnel.url}/slack/events`;

  logger.info(`\n${"─".repeat(54)}`);
  logger.info(`🌐 Public URL: ${tunnel.url}`);
  logger.info(`   Slack Events Request URL: ${slackUrl}`);
  logger.info(`${"─".repeat(54)}`);
  logger.info(`Register this URL in Linear:`);
  logger.info(`  Settings → API → Webhooks → New Webhook`);
  logger.info(`  URL:    ${webhookUrl}`);
  logger.info(`  Secret: ${secret}`);
  logger.info(`${"─".repeat(54)}\n`);
}

function setupShutdownHandlers(tunnel: Awaited<ReturnType<typeof localtunnel>>): void {
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

async function bootstrap(): Promise<void> {
  validateEnv();
  logger.info("🧪 [LOCAL] Starting webhook server (repo sync skipped)");

  const app = await createApp();
  await app.listen(WEBHOOK_PORT);
  logger.info(`✅ Webhook server on port ${WEBHOOK_PORT}`);

  const subdomain = resolveSubdomain();
  const tunnel = await openTunnel(subdomain);
  warnIfSubdomainChanged(subdomain, tunnel);
  logTunnelInfo(tunnel, process.env.LINEAR_WEBHOOK_SECRET!);
  setupShutdownHandlers(tunnel);
}

bootstrap().catch((err: Error) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
