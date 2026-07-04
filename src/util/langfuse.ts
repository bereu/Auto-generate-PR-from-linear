import { Langfuse as LangfuseSDK } from "langfuse";
import { logger } from "@/util/logger";
import { LANGFUSE_PROMPT_NAMES } from "@/constants/mastra.constants";
import { TRIAGE_SYSTEM_PROMPT } from "@/slack-bug-intake/slack-bug-intake.constants";

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
   * Fetches the bug-triage system prompt from Langfuse (production label) and
   * compiles it. Falls back to the local `TRIAGE_SYSTEM_PROMPT` if Langfuse is
   * unreachable, so triage never hard-fails on a prompt-fetch outage.
   */
  async fetchTriagePrompt(variables: Record<string, string> = {}): Promise<string> {
    try {
      const prompt = await this._client.getPrompt(LANGFUSE_PROMPT_NAMES.bugTriage, undefined, {
        type: "text",
        fallback: TRIAGE_SYSTEM_PROMPT,
      });

      if (prompt.isFallback) {
        logger.warn(
          `[langfuse] Using local fallback for prompt: ${LANGFUSE_PROMPT_NAMES.bugTriage}`,
        );
      }

      return prompt.compile(variables);
    } catch (error) {
      logger.warn(
        `[langfuse] Prompt fetch failed for ${LANGFUSE_PROMPT_NAMES.bugTriage}, using local default: ${(error as Error).message}`,
      );
      return TRIAGE_SYSTEM_PROMPT;
    }
  }

  client(): LangfuseSDK {
    return this._client;
  }
}

export const langfuse = Langfuse.getInstance();
