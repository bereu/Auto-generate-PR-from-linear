import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Message, Thread } from "chat";

vi.mock("chat", () => ({ Chat: vi.fn() }));
vi.mock("@chat-adapter/slack", () => ({ createSlackAdapter: vi.fn() }));
vi.mock("@chat-adapter/state-memory", () => ({ createMemoryState: vi.fn() }));

import { SlackBotCoordinator } from "@/slack-bug-intake/coordinator/slack-bot.coordinator";
import type { SlackTransfer } from "@/transfer/slack.transfer";
import type { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import type { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { makeTestMessage } from "@/test/message-helper";

function makeThread(messages: Message[]): Thread {
  return {
    id: "thread-1",
    recentMessages: messages,
    post: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
  } as unknown as Thread;
}

function setupCoordinator(): {
  coordinator: SlackBotCoordinator;
  mockSlackTransfer: Partial<SlackTransfer>;
  mockEvaluate: Partial<EvaluateBugReportQuery>;
  mockCreateIssue: Partial<CreateLinearIssueCommand>;
} {
  const mockSlackTransfer: Partial<SlackTransfer> = {
    onNewMention: vi.fn(),
    onSubscribedMessage: vi.fn(),
  };
  const mockEvaluate: Partial<EvaluateBugReportQuery> = { execute: vi.fn() };
  const mockCreateIssue: Partial<CreateLinearIssueCommand> = { execute: vi.fn() };
  const coordinator = new SlackBotCoordinator(
    mockSlackTransfer as SlackTransfer,
    mockEvaluate as EvaluateBugReportQuery,
    mockCreateIssue as CreateLinearIssueCommand,
  );
  return { coordinator, mockSlackTransfer, mockEvaluate, mockCreateIssue };
}

describe("SlackBotCoordinator.handleIncoming", () => {
  let coordinator: SlackBotCoordinator;

  beforeEach(() => {
    ({ coordinator } = setupCoordinator());
  });

  it("calls thread.refresh() on incoming message", async () => {
    const thread = makeThread([makeTestMessage("Test message", false)]);

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    expect(thread.refresh).toHaveBeenCalledOnce();
  });

  it("handles errors gracefully and continues", async () => {
    const thread = makeThread([]);
    // Mock thread.refresh to throw an error
    vi.mocked(thread.refresh).mockRejectedValueOnce(new Error("Connection failed"));

    // Should not throw; error is caught and logged
    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // No unhandled promise rejection
    expect(thread.refresh).toHaveBeenCalledOnce();
  });
});
