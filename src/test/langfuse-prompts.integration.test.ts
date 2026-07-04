import { describe, it, expect } from "vitest";
import { Langfuse as LangfuseSDK } from "langfuse";
import { LANGFUSE_PROMPT_NAMES } from "@/constants/mastra.constants";

const MIN_PROMPT_LENGTH = 0;

/**
 * Integration test: verifies every migrated prompt is actually served from
 * Langfuse (production label) rather than the local fallback. Requires live
 * Langfuse credentials — skipped automatically when they are absent so unit
 * runs (e.g. CI without secrets) stay green.
 */
const hasCredentials = Boolean(
  process.env.LANGFUSE_PUBLIC_KEY &&
  process.env.LANGFUSE_SECRET_KEY &&
  process.env.LANGFUSE_BASE_URL,
);

describe.skipIf(!hasCredentials)("Langfuse prompt migration (integration)", () => {
  const client = new LangfuseSDK({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });

  it.each(Object.entries(LANGFUSE_PROMPT_NAMES))(
    "fetches the '%s' prompt (%s) from Langfuse, not the local fallback",
    async (_key, promptName) => {
      const prompt = await client.getPrompt(promptName, undefined, {
        type: "text",
        fallback: "LOCAL_FALLBACK",
      });

      expect(prompt.isFallback).toBe(false);
      expect(prompt.prompt).not.toBe("LOCAL_FALLBACK");
      expect(prompt.prompt.length).toBeGreaterThan(MIN_PROMPT_LENGTH);
    },
  );
});
