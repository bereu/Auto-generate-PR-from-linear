import { Client } from "langsmith";
import nunjucks from "nunjucks";
import { logger } from "@/util/logger";

nunjucks.configure({ throwOnUndefined: true });

export class Langsmith {
  private static instance: Langsmith;
  private readonly _client: Client;

  private constructor() {
    this._client = new Client();
  }

  static getInstance(): Langsmith {
    if (!Langsmith.instance) {
      Langsmith.instance = new Langsmith();
    }
    return Langsmith.instance;
  }

  /**
   * Pulls a prompt from LangSmith Hub and renders it with provided variables.
   * Expects the prompt to be in f-string or Mustache format, but we use nunjucks for consistency with the project.
   */
  async pullAndRender(promptName: string, vars: Record<string, unknown>): Promise<string> {
    logger.info(`[langsmith] Pulling prompt: ${promptName}`);
    try {
      // Note: In a real environment, you need LANGSMITH_API_KEY set.
      const prompt = await (this._client as unknown as { pullPrompt: (n: string) => Promise<unknown> }).pullPrompt(
        promptName,
      );

      // LangChain prompts usually have multiple messages or a single template.
      // We'll extract the text content from the first message if it's a ChatPrompt, or use it directly.
      let templateContent = "";
      const promptObj = prompt as Record<string, unknown>;

      if (typeof prompt === "string") {
        templateContent = prompt;
      } else if (Array.isArray(promptObj["template"])) {
        // Handle Hub results which might be an array of messages
        templateContent =
          ((promptObj["template"][0] as Record<string, unknown>)?.["content"] as string) || "";
      } else if (promptObj["template"]) {
        templateContent = promptObj["template"] as string;
      }

      if (!templateContent) {
        throw new Error(`Could not extract template content from prompt: ${promptName}`);
      }

      const rendered = nunjucks.renderString(templateContent, vars).trim();
      logger.info(`[langsmith] Prompt rendered successfully: ${promptName}`);
      return rendered;
    } catch (error) {
      logger.error(`[langsmith] Failed for ${promptName}: ${(error as Error).message}`);
      throw new Error(
        `Failed to pull prompt '${promptName}' from LangSmith: ${(error as Error).message}`,
      );
    }
  }

  client(): Client {
    return this._client;
  }
}

export const langsmith = Langsmith.getInstance();
