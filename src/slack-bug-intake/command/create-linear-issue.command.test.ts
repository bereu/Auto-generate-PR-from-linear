import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { makeTestMessage } from "@/test/message-helper";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

import { generateObject } from "ai";

describe("CreateLinearIssueCommand", () => {
  let command: CreateLinearIssueCommand;
  let mockLinearTransfer: { createIssue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockLinearTransfer = {
      createIssue: vi.fn().mockResolvedValue({ url: "https://linear.app/issue/ENG-123" }),
    };
    command = new CreateLinearIssueCommand(mockLinearTransfer as never);
    vi.clearAllMocks();
  });

  it("calls linearTransfer.createIssue with labelNames agent", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "Login button broken", description: "## Summary\nButton does not work." },
    } as never);

    const messages = [makeTestMessage("The login button is broken on Chrome.", false)];
    await command.execute(messages);

    expect(mockLinearTransfer.createIssue).toHaveBeenCalledOnce();
    expect(mockLinearTransfer.createIssue).toHaveBeenCalledWith({
      title: "Login button broken",
      description: "## Summary\nButton does not work.",
      labelNames: ["agent"],
    });
  });

  it("returns the issue URL on success", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "t", description: "d" },
    } as never);

    const result = await command.execute([makeTestMessage("report", false)]);
    expect(result.url).toBe("https://linear.app/issue/ENG-123");
  });

  it("includes all messages in the prompt", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "t", description: "d" },
    } as never);

    const messages = [
      makeTestMessage("Report", false),
      makeTestMessage("What happened?", true),
      makeTestMessage("It crashed.", false),
    ];
    await command.execute(messages);

    expect(generateObject).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as { messages: unknown[] };
    expect(callArgs.messages).toHaveLength(3);
  });

  it("calls generateObject with the correct model and system prompt", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "t", description: "d" },
    } as never);

    await command.execute([makeTestMessage("report", false)]);

    expect(generateObject).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as {
      model: unknown;
      system: string;
    };
    expect(callArgs.model).toBe("mock-model");
    expect(callArgs.system).toContain("bug report formatter");
  });
});
