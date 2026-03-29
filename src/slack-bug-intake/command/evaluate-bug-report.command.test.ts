import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvaluateBugReportCommand } from "@/slack-bug-intake/command/evaluate-bug-report.command";
import { makeTestMessage } from "@/test/message-helper";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

import { generateObject } from "ai";

describe("EvaluateBugReportCommand", () => {
  let command: EvaluateBugReportCommand;

  beforeEach(() => {
    command = new EvaluateBugReportCommand();
    vi.clearAllMocks();
  });

  it("returns isComplete true and null question when report is complete", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { isComplete: true, clarifyingQuestion: null },
    } as never);

    const messages = [makeTestMessage("Here is my complete bug report with all details.", false)];
    const result = await command.execute(messages);

    expect(result.isComplete).toBe(true);
    expect(result.clarifyingQuestion).toBeNull();
  });

  it("returns isComplete false with question when steps to reproduce are missing", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        isComplete: false,
        clarifyingQuestion: "Could you provide the steps to reproduce this issue?",
      },
    } as never);

    const messages = [makeTestMessage("The button is broken.", false)];
    const result = await command.execute(messages);

    expect(result.isComplete).toBe(false);
    expect(result.clarifyingQuestion).toBe("Could you provide the steps to reproduce this issue?");
  });

  it("returns isComplete false with question when environment is missing", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        isComplete: false,
        clarifyingQuestion: "What OS and browser are you using?",
      },
    } as never);

    const messages = [makeTestMessage("Login fails when I click submit.", false)];
    const result = await command.execute(messages);

    expect(result.isComplete).toBe(false);
    expect(result.clarifyingQuestion).toBe("What OS and browser are you using?");
  });

  it("maps bot messages to role assistant and user messages to role user", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { isComplete: false, clarifyingQuestion: "What environment?" },
    } as never);

    const messages = [
      makeTestMessage("The button is broken.", false),
      makeTestMessage("Can you describe the expected behaviour?", true),
      makeTestMessage("I expected it to submit the form.", false),
    ];

    await command.execute(messages);

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as { messages: unknown[] };
    expect(callArgs.messages).toEqual([
      { role: "user", content: "The button is broken." },
      { role: "assistant", content: "Can you describe the expected behaviour?" },
      { role: "user", content: "I expected it to submit the form." },
    ]);
  });

  it("calls generateObject with the correct model and system prompt", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { isComplete: true, clarifyingQuestion: null },
    } as never);

    await command.execute([makeTestMessage("report", false)]);

    expect(generateObject).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as {
      model: unknown;
      system: string;
    };
    expect(callArgs.model).toBe("mock-model");
    expect(callArgs.system).toContain("bug triage assistant");
  });
});
