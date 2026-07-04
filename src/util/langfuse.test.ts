import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TRIAGE_SYSTEM_PROMPT,
  FORMAT_SYSTEM_PROMPT,
} from "@/slack-bug-intake/slack-bug-intake.constants";

const { getPromptMock, warnMock, loadRawMock, loadMock } = vi.hoisted(() => ({
  getPromptMock: vi.fn(),
  warnMock: vi.fn(),
  loadRawMock: vi.fn(() => "raw task {{title}}"),
  loadMock: vi.fn(() => "rendered task"),
}));

vi.mock("langfuse", () => ({
  Langfuse: class {
    getPrompt = getPromptMock;
  },
}));

vi.mock("@/util/logger", () => ({
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/util/prompt-loader", () => ({
  promptLoader: { loadRaw: loadRawMock, load: loadMock },
}));

import { langfuse } from "@/util/langfuse";

describe("langfuse.fetchTriagePrompt", () => {
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

describe("langfuse.fetchFormatPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and compiles the format prompt", async () => {
    getPromptMock.mockResolvedValue({
      isFallback: false,
      compile: () => "compiled format",
    });

    const result = await langfuse.fetchFormatPrompt();

    expect(result).toBe("compiled format");
    expect(warnMock).not.toHaveBeenCalled();
  });

  it("falls back to FORMAT_SYSTEM_PROMPT when the format fetch throws", async () => {
    getPromptMock.mockRejectedValue(new Error("network down"));

    const result = await langfuse.fetchFormatPrompt();

    expect(result).toBe(FORMAT_SYSTEM_PROMPT);
    expect(warnMock).toHaveBeenCalledOnce();
  });
});

describe("langfuse.fetchTaskPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and compiles the task prompt from Langfuse", async () => {
    getPromptMock.mockResolvedValue({
      isFallback: false,
      compile: () => "compiled task",
    });

    const result = await langfuse.fetchTaskPrompt({ title: "T" });

    expect(result).toBe("compiled task");
    expect(loadRawMock).toHaveBeenCalledWith("task");
  });

  it("renders the local task template via promptLoader when the fetch throws", async () => {
    getPromptMock.mockRejectedValue(new Error("network down"));

    const result = await langfuse.fetchTaskPrompt({ title: "T" });

    expect(result).toBe("rendered task");
    expect(loadMock).toHaveBeenCalledWith("task", { title: "T" });
    expect(warnMock).toHaveBeenCalledOnce();
  });
});
