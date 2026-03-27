import { NestFactory } from "@nestjs/core";
import { json, type Request } from "express";
import { AppModule } from "./app.module.ts";
import { logger } from "@/logger.ts";

export function validateEnv(): void {
  const required = [
    "GITHUB_TOKEN",
    "LINEAR_API_KEY",
    "ANTHROPIC_API_KEY",
    "LINEAR_WEBHOOK_SECRET",
  ] as const;
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error(`❌ 環境変数が不足しています: ${missing.join(", ")}`);
    process.exit(1);
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
