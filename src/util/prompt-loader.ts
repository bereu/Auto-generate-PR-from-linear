import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nunjucks from "nunjucks";
import { logger } from "@/util/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, "../..", "prompts");

nunjucks.configure({ throwOnUndefined: true });

export class PromptLoader {
  private static instance: PromptLoader;

  private constructor() {}

  static getInstance(): PromptLoader {
    if (!PromptLoader.instance) {
      PromptLoader.instance = new PromptLoader();
    }
    return PromptLoader.instance;
  }

  /**
   * Reads the raw, unrendered template file (variables left intact). Used as the
   * offline fallback source when a prompt is served from Langfuse.
   */
  loadRaw(name: string): string {
    const filePath = path.join(PROMPTS_DIR, `${name}.md`);

    if (!fs.existsSync(filePath)) {
      logger.error(`[prompt-loader] Prompt file not found: ${filePath}`);
      throw new Error(`Prompt file not found: ${filePath}`);
    }

    return fs.readFileSync(filePath, "utf-8");
  }

  load(name: string, vars: Record<string, string>): string {
    logger.info(`[prompt-loader] Loading prompt: ${name}`);
    const template = this.loadRaw(name);
    try {
      const rendered = nunjucks.renderString(template, vars).trim();
      logger.info(`[prompt-loader] Prompt loaded and rendered: ${name}`);
      return rendered;
    } catch (err) {
      logger.error(`[prompt-loader] Failed to render ${name}: ${(err as Error).message}`);
      throw err;
    }
  }
}

export const promptLoader = PromptLoader.getInstance();
