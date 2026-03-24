import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import nunjucks from "nunjucks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.join(__dirname, "..", "prompts");

nunjucks.configure({ throwOnUndefined: true });

// ----------------------------------------
// nunjucks (promptfoo の {{variable}} 記法と同一エンジン) でテンプレートを描画
// prompts/{name}.md を読み込み、vars の値で {{key}} を置換して返す
// ----------------------------------------
export function loadPrompt(name: string, vars: Record<string, string>): string {
  const filePath = path.join(PROMPTS_DIR, `${name}.md`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Prompt file not found: ${filePath}`);
  }

  const template = fs.readFileSync(filePath, "utf-8");
  return nunjucks.renderString(template, vars).trim();
}
