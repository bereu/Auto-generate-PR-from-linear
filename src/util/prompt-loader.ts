import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nunjucks from "nunjucks";
import { logger } from "@/util/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, "../..", "prompts");

nunjucks.configure({ throwOnUndefined: true });

// ----------------------------------------
// nunjucks (promptfoo の {{variable}} 記法と同一 engine) でテンプレートを描画
// prompts/{name}.md を読み込み、vars の値で {{key}} を置換して返す
// ----------------------------------------
export function loadPrompt(name: string, vars: Record<string, string>): string {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);
  logger.info(`[prompt-loader] Loading prompt: ${name}`);

  if (!fs.existsSync(filePath)) {
    logger.error(`[prompt-loader] Prompt file not found: ${filePath}`);
    throw new Error(`Prompt file not found: ${filePath}`);
  }

  const template = fs.readFileSync(filePath, "utf-8");
  try {
    const rendered = nunjucks.renderString(template, vars).trim();
    logger.info(`[prompt-loader] Prompt loaded and rendered: ${name}`);
    return rendered;
  } catch (err) {
    logger.error(`[prompt-loader] Failed to render ${name}: ${(err as Error).message}`);
    throw err;
  }
}
