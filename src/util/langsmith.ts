import { Client } from "langsmith";
import nunjucks from "nunjucks";

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
  async pullAndRender(promptName: string, vars: Record<string, any>): Promise<string> {
    try {
      // Note: In a real environment, you need LANGSMITH_API_KEY set.
      const prompt = await this._client.pullPrompt(promptName);

      // LangChain prompts usually have multiple messages or a single template.
      // We'll extract the text content from the first message if it's a ChatPrompt, or use it directly.
      let templateContent = "";

      if (typeof prompt === "string") {
        templateContent = prompt;
      } else if (Array.isArray((prompt as any).template)) {
        // Handle Hub results which might be an array of messages
        templateContent = (prompt as any).template[0]?.content || "";
      } else if ((prompt as any).template) {
        templateContent = (prompt as any).template;
      }

      if (!templateContent) {
        throw new Error(`Could not extract template content from prompt: ${promptName}`);
      }

      return nunjucks.renderString(templateContent, vars).trim();
    } catch (error) {
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
