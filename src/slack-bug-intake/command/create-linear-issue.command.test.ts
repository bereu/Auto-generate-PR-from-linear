import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { BugReport } from "@/domain/bug-report/bug-report";
import type { Message } from "chat";

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

import { generateObject } from "ai";

function makeMessage(text: string, isMe: boolean): Message {
  return {
    id: "msg-1",
    threadId: "thread-1",
    text,
    author: { userId: "u1", userName: "user", fullName: "User", isBot: isMe, isMe },
    metadata: { dateSent: new Date(), edited: false },
    formatted: {} as Message["formatted"],
    raw: {},
    attachments: [],
    links: [],
    toJSON: vi.fn(),
  } as unknown as Message;
}

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

    const messages = [makeMessage("The login button is broken on Chrome.", false)];
    await command.execute(messages);

    expect(mockLinearTransfer.createIssue).toHaveBeenCalledOnce();
    expect(mockLinearTransfer.createIssue).toHaveBeenCalledWith({
      title: "Login button broken",
      description: "## Summary\nButton does not work.",
      labelNames: ["agent"],
    });
  });

  it("returns the url from linearTransfer.createIssue", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "Login button broken", description: "## Summary\nDetails." },
    } as never);

    const messages = [makeMessage("Bug report here.", false)];
    const result = await command.execute(messages);

    expect(result.url).toBe("https://linear.app/issue/ENG-123");
  });

  it("maps message roles correctly for AI SDK", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "Title", description: "Desc" },
    } as never);

    const messages = [
      makeMessage("The button is broken.", false),
      makeMessage("What environment are you on?", true),
      makeMessage("Chrome on macOS.", false),
    ];

    await command.execute(messages);

    const callArgs = vi.mocked(generateObject).mock.calls[0][0] as { messages: unknown[] };
    expect(callArgs.messages).toEqual([
      { role: "user", content: "The button is broken." },
      { role: "assistant", content: "What environment are you on?" },
      { role: "user", content: "Chrome on macOS." },
    ]);
  });
});

describe("BugReport", () => {
  it("throws when title is empty", () => {
    expect(() => BugReport.create("", "Some description")).toThrow(
      "BugReport title cannot be empty",
    );
  });

  it("throws when description is empty", () => {
    expect(() => BugReport.create("Some title", "")).toThrow(
      "BugReport description cannot be empty",
    );
  });

  it("throws when title is whitespace only", () => {
    expect(() => BugReport.create("   ", "description")).toThrow("BugReport title cannot be empty");
  });

  it("returns title and description via getters", () => {
    const report = BugReport.create("Login broken", "## Summary\nDetails here.");
    expect(report.title()).toBe("Login broken");
    expect(report.description()).toBe("## Summary\nDetails here.");
  });
});
