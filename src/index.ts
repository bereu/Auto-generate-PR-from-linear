import { syncAllRepos } from "@/sync-repos.js";
import { runAgentLoop } from "@/agent.js";
import { logger } from "@/logger.js";

async function main(): Promise<void> {
  logger.info("🚀 Claude Linear Agent starting...");

  const required = ["GITHUB_TOKEN", "LINEAR_API_KEY", "ANTHROPIC_API_KEY"] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error(`❌ 環境変数が不足しています: ${missing.join(", ")}`);
    process.exit(1);
  }

  const { failed } = await syncAllRepos();
  if (failed.length > 0) {
    logger.warn(
      `⚠️  ${failed.length} repo(s) failed to sync: ${failed.map((f) => f.name).join(", ")}`,
    );
  }
  await runAgentLoop();
}

main().catch((err: Error) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
