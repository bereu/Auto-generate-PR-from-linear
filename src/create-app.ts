import { NestFactory } from "@nestjs/core";
import { json, type Request } from "express";
import { AppModule } from "@/app.module";
import { logger } from "@/util/logger";

const NO_MISSING = 0;
const EXIT_CODE_ERROR = 1;

export function validateEnv(): void {
  const required = [
    "GITHUB_TOKEN",
    "LINEAR_API_KEY",
    "ANTHROPIC_API_KEY",
    "LINEAR_WEBHOOK_SECRET",
    "SLACK_BOT_TOKEN",
    "SLACK_SIGNING_SECRET",
  ] as const;
  // LANGFUSE_* and ROLLBAR_* are intentionally optional:
  // - langfuse util falls back to local TRIAGE_SYSTEM_PROMPT when unset/unreachable
  // - rollbar util disables error reporting when ROLLBAR_ACCESS_TOKEN is unset
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > NO_MISSING) {
    logger.error(`❌ 環境変数が不足しています: ${missing.join(", ")}`);
    process.exit(EXIT_CODE_ERROR);
  }
}

export async function createApp(): Promise<Awaited<ReturnType<typeof NestFactory.create>>> {
  const app = await NestFactory.create(AppModule, { logger: false, bodyParser: false });
  app.use(
    json({
      verify: (req: Request, _res, buf) => {
        (req as Request & { rawBody: Buffer }).rawBody = buf;
      },
    }),
  );
  return app;
}
