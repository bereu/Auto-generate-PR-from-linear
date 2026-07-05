import { describe, it, expect, vi, beforeEach } from "vitest";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { makeTestMessage } from "@/test/message-helper";

const FIRST_CALL = 0;
const FIRST_ARG = 0;
const EXPECTED_MESSAGE_COUNT = 3;

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => "mock-model"),
}));

import { generateObject } from "ai";

function setupCommandTest(): {
  command: CreateLinearIssueCommand;
  mockLinearTransfer: { createIssue: ReturnType<typeof vi.fn> };
} {
  const mockLinearTransfer = {
    createIssue: vi.fn().mockResolvedValue({ url: "https://linear.app/issue/ENG-123" }),
  };
  const command = new CreateLinearIssueCommand(mockLinearTransfer as never);
  vi.clearAllMocks();
  return { command, mockLinearTransfer };
}

describe("CreateLinearIssueCommand - without difficulty", () => {
  let command: CreateLinearIssueCommand;
  let mockLinearTransfer: { createIssue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ command, mockLinearTransfer } = setupCommandTest());
  });

  it("calls createIssue with agent label when no difficulty provided", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "Login button broken", description: "## Summary\nButton does not work." },
    } as never);

    const messages = [makeTestMessage("The login button is broken on Chrome.", false)];
    await command.execute(messages);

    expect(mockLinearTransfer.createIssue).toHaveBeenCalledWith({
      title: "Login button broken",
      description: "## Summary\nButton does not work.",
      labelNames: ["agent"],
      stateName: "Todo",
    });
  });
});

describe("CreateLinearIssueCommand - with difficulty", () => {
  let command: CreateLinearIssueCommand;
  let mockLinearTransfer: { createIssue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ command, mockLinearTransfer } = setupCommandTest());
  });

  it("includes agent and hard labels when difficulty is hard", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "Complex query issue", description: "## Summary\nSlow performance." },
    } as never);

    const messages = [makeTestMessage("Database query is slow.", false)];
    await command.execute(messages, "hard");

    expect(mockLinearTransfer.createIssue).toHaveBeenCalledWith({
      title: "Complex query issue",
      description: "## Summary\nSlow performance.",
      labelNames: ["agent", "hard"],
      stateName: "Todo",
    });
  });
});

describe("CreateLinearIssueCommand - easy difficulty", () => {
  let command: CreateLinearIssueCommand;
  let mockLinearTransfer: { createIssue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ command, mockLinearTransfer } = setupCommandTest());
  });

  it("includes easy difficulty label", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "test", description: "test" },
    } as never);

    const messages = [makeTestMessage("issue", false)];
    await command.execute(messages, "easy");

    expect(mockLinearTransfer.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        labelNames: ["agent", "easy"],
      }),
    );
  });
});

describe("CreateLinearIssueCommand - medium difficulty", () => {
  let command: CreateLinearIssueCommand;
  let mockLinearTransfer: { createIssue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ command, mockLinearTransfer } = setupCommandTest());
  });

  it("includes medium difficulty label", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "test", description: "test" },
    } as never);

    const messages = [makeTestMessage("issue", false)];
    await command.execute(messages, "medium");

    expect(mockLinearTransfer.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        labelNames: ["agent", "medium"],
      }),
    );
  });
});

describe("CreateLinearIssueCommand - hard difficulty", () => {
  let command: CreateLinearIssueCommand;
  let mockLinearTransfer: { createIssue: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    ({ command, mockLinearTransfer } = setupCommandTest());
  });

  it("includes hard difficulty label", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "test", description: "test" },
    } as never);

    const messages = [makeTestMessage("issue", false)];
    await command.execute(messages, "hard");

    expect(mockLinearTransfer.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        labelNames: ["agent", "hard"],
      }),
    );
  });
});

describe("CreateLinearIssueCommand - return value", () => {
  let command: CreateLinearIssueCommand;

  beforeEach(() => {
    ({ command } = setupCommandTest());
  });

  it("returns the issue URL on success", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "t", description: "d" },
    } as never);

    const result = await command.execute([makeTestMessage("report", false)]);
    expect(result.url).toBe("https://linear.app/issue/ENG-123");
  });
});

describe("CreateLinearIssueCommand - generateObject messages", () => {
  let command: CreateLinearIssueCommand;

  beforeEach(() => {
    ({ command } = setupCommandTest());
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
    const callArgs = vi.mocked(generateObject).mock.calls[FIRST_CALL][FIRST_ARG] as {
      messages: unknown[];
    };
    expect(callArgs.messages).toHaveLength(EXPECTED_MESSAGE_COUNT);
  });
});

describe("CreateLinearIssueCommand - generateObject options", () => {
  let command: CreateLinearIssueCommand;

  beforeEach(() => {
    ({ command } = setupCommandTest());
  });

  it("calls generateObject with the correct model and system prompt", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { title: "t", description: "d" },
    } as never);

    await command.execute([makeTestMessage("report", false)]);

    expect(generateObject).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(generateObject).mock.calls[FIRST_CALL][FIRST_ARG] as {
      model: unknown;
      system: string;
    };
    expect(callArgs.model).toBe("mock-model");
    expect(callArgs.system).toContain("bug report formatter");
  });
});
