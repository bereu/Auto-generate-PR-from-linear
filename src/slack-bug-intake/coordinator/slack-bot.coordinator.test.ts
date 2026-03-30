import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FALLBACK_MESSAGE,
  MAX_CLARIFICATION_ROUNDS,
} from "@/slack-bug-intake/slack-bug-intake.constants";
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

describe("SlackBotCoordinator.handleIncoming", () => {
  let coordinator: SlackBotCoordinator;
  let mockSlackTransfer: Partial<SlackTransfer>;
  let mockEvaluate: Partial<EvaluateBugReportQuery>;
  let mockCreateIssue: Partial<CreateLinearIssueCommand>;

  beforeEach(() => {
    mockSlackTransfer = {
      onNewMention: vi.fn(),
      onSubscribedMessage: vi.fn(),
    };
    mockEvaluate = { execute: vi.fn() };
    mockCreateIssue = { execute: vi.fn() };
    coordinator = new SlackBotCoordinator(
      mockSlackTransfer as SlackTransfer,
      mockEvaluate as EvaluateBugReportQuery,
      mockCreateIssue as CreateLinearIssueCommand,
    );
  });

  it("creates issue and unsubscribes when report is complete", async () => {
    vi.mocked(mockEvaluate.execute!).mockResolvedValue({
      isComplete: true,
      clarifyingQuestion: null,
    });
    vi.mocked(mockCreateIssue.execute!).mockResolvedValue({
      url: "https://linear.app/issue/ENG-1",
    });

    const thread = makeThread([makeTestMessage("Full bug report.", false)]);
    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    expect(mockCreateIssue.execute).toHaveBeenCalledOnce();
    expect(thread.post).toHaveBeenCalledWith(
      "Linear issue created: https://linear.app/issue/ENG-1",
    );
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
  });

  it("posts clarifying question when report is incomplete and rounds < MAX", async () => {
    vi.mocked(mockEvaluate.execute!).mockResolvedValue({
      isComplete: false,
      clarifyingQuestion: "What OS are you using?",
    });

    const thread = makeThread([makeTestMessage("The button is broken.", false)]);
    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    expect(thread.post).toHaveBeenCalledWith("What OS are you using?");
    expect(thread.unsubscribe).not.toHaveBeenCalled();
    expect(mockCreateIssue.execute).not.toHaveBeenCalled();
  });

  it("posts fallback message and unsubscribes after MAX_CLARIFICATION_ROUNDS", async () => {
    vi.mocked(mockEvaluate.execute!).mockResolvedValue({
      isComplete: false,
      clarifyingQuestion: "Still missing info.",
    });

    const botMessages = Array.from({ length: MAX_CLARIFICATION_ROUNDS }, (_, i) =>
      makeTestMessage(`Question ${i + 1}`, true),
    );
    const thread = makeThread([makeTestMessage("Initial report", false), ...botMessages]);

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    expect(thread.post).toHaveBeenCalledWith(FALLBACK_MESSAGE);
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
    expect(mockCreateIssue.execute).not.toHaveBeenCalled();
  });

  it("posts fallback and unsubscribes when clarifyingQuestion is null but report incomplete", async () => {
    vi.mocked(mockEvaluate.execute!).mockResolvedValue({
      isComplete: false,
      clarifyingQuestion: null,
    });

    const thread = makeThread([makeTestMessage("Vague report.", false)]);
    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    expect(thread.post).toHaveBeenCalledWith(FALLBACK_MESSAGE);
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
  });
});
