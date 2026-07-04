import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRIAGE_SYSTEM_PROMPT } from "@/slack-bug-intake/slack-bug-intake.constants";

const { getPromptMock, warnMock } = vi.hoisted(() => ({
  getPromptMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("langfuse", () => ({
  Langfuse: class {
    getPrompt = getPromptMock;
  },
}));

vi.mock("@/util/logger", () => ({
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { langfuse } from "@/util/langfuse";

describe("langfuse util", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the compiled prompt fetched from Langfuse", async () => {
    getPromptMock.mockResolvedValue({
      isFallback: false,
      compile: () => "compiled prompt text",
    });

    const result = await langfuse.fetchTriagePrompt();

    expect(result).toBe("compiled prompt text");
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("warns when Langfuse returns its fallback prompt", async () => {
    getPromptMock.mockResolvedValue({
      isFallback: true,
      compile: () => TRIAGE_SYSTEM_PROMPT,
    });

    const result = await langfuse.fetchTriagePrompt();

    expect(result).toBe(TRIAGE_SYSTEM_PROMPT);
    expect(warnMock).toHaveBeenCalledOnce();
  });

  it("falls back to the local prompt and warns when the fetch throws", async () => {
    getPromptMock.mockRejectedValue(new Error("network down"));

    const result = await langfuse.fetchTriagePrompt();

    expect(result).toBe(TRIAGE_SYSTEM_PROMPT);
    expect(warnMock).toHaveBeenCalledOnce();
  });
});
