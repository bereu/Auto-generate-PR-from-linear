import { Langfuse as LangfuseSDK } from "langfuse";
import { logger } from "@/util/logger";
import { LANGFUSE_PROMPT_NAMES } from "@/constants/mastra.constants";
import {
  TRIAGE_SYSTEM_PROMPT,
  FORMAT_SYSTEM_PROMPT,
  COMPLEXITY_SYSTEM_PROMPT,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { promptLoader } from "@/util/prompt-loader";

const TASK_PROMPT_NAME = "task";

/**
 * Langfuse singleton — cross-cutting utility for prompt management + tracing.
 *
 * Its role is observability / prompt retrieval, not a runtime business service,
 * so it lives in `src/util` as a singleton (per the util singleton convention).
 * All layers may reference it directly.
 */
export class Langfuse {
  private static instance: Langfuse;
  private readonly _client: LangfuseSDK;

  private constructor() {
    this._client = new LangfuseSDK({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASE_URL,
    });
  }

  static getInstance(): Langfuse {
    if (!Langfuse.instance) {
      Langfuse.instance = new Langfuse();
    }
    return Langfuse.instance;
  }

  /**
   * Fetches a text prompt from Langfuse (production label) and compiles it with
   * `variables`. Falls back to the local template if Langfuse is unreachable, so
   * a prompt-fetch outage never hard-fails the caller.
   *
   * @param name             Langfuse prompt name.
   * @param fallbackTemplate Raw local template (may contain `{{var}}` tokens).
   * @param variables        Values to substitute into the template.
   * @param renderFallback   Renders `fallbackTemplate` locally when the fetch
   *                         throws outright. Defaults to returning it verbatim.
   */
  private async fetchTextPrompt(
    name: string,
    fallbackTemplate: string,
    variables: Record<string, string>,
    renderFallback: () => string = () => fallbackTemplate,
  ): Promise<string> {
    try {
      const prompt = await this._client.getPrompt(name, undefined, {
        type: "text",
        fallback: fallbackTemplate,
      });

      if (prompt.isFallback) {
        logger.warn(`[langfuse] Using local fallback for prompt: ${name}`);
      }

      return prompt.compile(variables);
    } catch (error) {
      logger.warn(
        `[langfuse] Prompt fetch failed for ${name}, using local default: ${(error as Error).message}`,
      );
      return renderFallback();
    }
  }

  /**
   * Bug-triage system prompt. No variables. Falls back to `TRIAGE_SYSTEM_PROMPT`.
   */
  async fetchTriagePrompt(variables: Record<string, string> = {}): Promise<string> {
    return this.fetchTextPrompt(LANGFUSE_PROMPT_NAMES.bugTriage, TRIAGE_SYSTEM_PROMPT, variables);
  }

  /**
   * Bug-report formatter system prompt. No variables. Falls back to
   * `FORMAT_SYSTEM_PROMPT`.
   */
  async fetchFormatPrompt(variables: Record<string, string> = {}): Promise<string> {
    return this.fetchTextPrompt(
      LANGFUSE_PROMPT_NAMES.bugReportFormat,
      FORMAT_SYSTEM_PROMPT,
      variables,
    );
  }

  /**
   * Issue complexity assessment system prompt. No variables. Falls back to
   * `COMPLEXITY_SYSTEM_PROMPT`.
   */
  async fetchComplexityPrompt(variables: Record<string, string> = {}): Promise<string> {
    return this.fetchTextPrompt(
      LANGFUSE_PROMPT_NAMES.complexity,
      COMPLEXITY_SYSTEM_PROMPT,
      variables,
    );
  }

  /**
   * Coding-agent task prompt. Uses the `{{var}}` tokens in `prompts/task.md` as
   * the offline fallback, rendered via the local `promptLoader` when Langfuse
   * throws so variables are still substituted.
   */
  async fetchTaskPrompt(variables: Record<string, string>): Promise<string> {
    return this.fetchTextPrompt(
      LANGFUSE_PROMPT_NAMES.agentTask,
      promptLoader.loadRaw(TASK_PROMPT_NAME),
      variables,
      () => promptLoader.load(TASK_PROMPT_NAME, variables),
    );
  }

  client(): LangfuseSDK {
    return this._client;
  }
}

export const langfuse = Langfuse.getInstance();
