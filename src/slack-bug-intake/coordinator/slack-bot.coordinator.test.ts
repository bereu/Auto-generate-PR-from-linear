import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Message, Thread } from "chat";

vi.mock("chat", () => ({ Chat: vi.fn() }));
vi.mock("@chat-adapter/slack", () => ({ createSlackAdapter: vi.fn() }));
vi.mock("@chat-adapter/state-memory", () => ({ createMemoryState: vi.fn() }));
vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "mock-model") }));

import { SlackBotCoordinator } from "@/slack-bug-intake/coordinator/slack-bot.coordinator";
import type { SlackTransfer } from "@/transfer/slack.transfer";
import type { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import type { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import { makeTestMessage } from "@/test/message-helper";
import {
  WORKFLOW_ERROR_MESSAGE,
  ERROR_RESPONSE_MESSAGES,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { generateObject } from "ai";

const FIRST_CALL_ARG = 0;

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

// eslint-disable-next-line max-lines-per-function
describe("SlackBotCoordinator.handleIncoming", () => {
  let coordinator: SlackBotCoordinator;
  let mockEvaluate: Partial<EvaluateBugReportQuery>;
  let mockCreateIssue: Partial<CreateLinearIssueCommand>;

  beforeEach(() => {
    ({ coordinator, mockEvaluate, mockCreateIssue } = setupCoordinator());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("calls thread.refresh() on incoming message", async () => {
    const thread = makeThread([makeTestMessage("Test message", false)]);

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    expect(thread.refresh).toHaveBeenCalledOnce();
  });

  it("handles errors gracefully and notifies the reporter in-thread", async () => {
    const thread = makeThread([]);
    // Mock thread.refresh to throw an error
    vi.mocked(thread.refresh).mockRejectedValueOnce(new Error("Connection failed"));

    // Should not throw; error is caught and logged
    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // No unhandled promise rejection
    expect(thread.refresh).toHaveBeenCalledOnce();
    // Reporter is not left hanging: error notification posted
    expect(thread.post).toHaveBeenCalledWith(WORKFLOW_ERROR_MESSAGE);
  });

  /**
   * Failure path: a workflow step fails (Mastra resolves with a `failed` status
   * rather than throwing). The coordinator must detect it, report it, and notify
   * the reporter — never silently succeed.
   */
  it("posts an error notification when the workflow fails", async () => {
    const thread = makeThread([makeTestMessage("Bug report", false)]);

    // A failing evaluate step causes Mastra to resolve the run with status "failed".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockRejectedValueOnce(new Error("LLM timeout"));

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // Reporter is notified with the workflow error message
    expect(thread.post).toHaveBeenCalledWith(WORKFLOW_ERROR_MESSAGE);
    // No Linear issue created on failure
    expect(mockCreateIssue!.execute).not.toHaveBeenCalled();
  });

  /**
   * Pattern-specific replies: a complete report whose Linear issue creation fails
   * must tell the reporter to file directly in Linear, not show the generic message.
   */
  it("posts the Linear-failure reply when issue creation fails", async () => {
    const messages = [makeTestMessage("App crashes on startup with repro steps", false)];
    const thread = makeThread(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockResolvedValueOnce({
      isComplete: true,
      clarifyingQuestion: null,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(generateObject as any).mockResolvedValueOnce({ object: { difficulty: "medium" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockCreateIssue!.execute as any).mockRejectedValueOnce(
      new Error("Linear issue creation failed"),
    );

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    expect(thread.post).toHaveBeenCalledWith(ERROR_RESPONSE_MESSAGES.linearCreationFailed);
  });

  /**
   * Branch 1: Complete report → assess complexity → create Linear issue, post URL, unsubscribe
   * Ensures only the completion branch (assess + create) runs, not the fallback.
   * The assessComplexityStep now performs assessment inline via generateObject.
   */
  it("creates Linear issue and unsubscribes when report is complete", async () => {
    const messages = [
      makeTestMessage("My bug: app crashes on startup", false),
      makeTestMessage("Can you help?", false),
    ];
    const thread = makeThread(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockResolvedValueOnce({
      isComplete: true,
      clarifyingQuestion: null,
    });
    // Mock generateObject for the inline complexity assessment in assessComplexityStep
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(generateObject as any).mockResolvedValueOnce({
      object: { difficulty: "medium" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockCreateIssue!.execute as any).mockResolvedValueOnce({
      url: "https://linear.app/issue/123",
    });

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // Verify createIssueStep ran with the assessed difficulty: Linear issue created and URL posted
    expect(mockCreateIssue!.execute).toHaveBeenCalledWith(messages, "medium");
    expect(thread.post).toHaveBeenCalledWith("Linear issue created: https://linear.app/issue/123");
    // Verify unsubscribe was called (sign of createIssueStep, not other branches)
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
    // Verify fallback message was NOT posted (would indicate duplicate response bug)
    expect(
      vi
        .mocked(thread.post)
        .mock.calls.every((call) => !String(call[FIRST_CALL_ARG]).includes(WORKFLOW_ERROR_MESSAGE)),
    ).toBe(true);
  });

  /**
   * Branch 2: Incomplete + question + rounds remaining → post question, don't unsubscribe
   * Ensures only the ask branch runs, not the fallback.
   */
  it("posts clarifying question when report incomplete, question exists, and rounds remain", async () => {
    const messages = [
      makeTestMessage("There is a bug", false),
      makeTestMessage("Bot question", true),
      makeTestMessage("User response", false),
    ];
    const thread = makeThread(messages);

    const clarifyingQuestion = "What is the expected behavior?";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockResolvedValueOnce({
      isComplete: false,
      clarifyingQuestion,
      // botTurns = 1 (only "Bot question" is from bot), which is < MAX_CLARIFICATION_ROUNDS (5)
    });

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // Verify askStep ran: clarifying question posted
    expect(thread.post).toHaveBeenCalledWith(clarifyingQuestion);
    // Verify unsubscribe was NOT called (sign of askStep, not fallback)
    expect(thread.unsubscribe).not.toHaveBeenCalled();
    // Verify fallback message was NOT posted (would indicate duplicate response bug)
    expect(
      vi
        .mocked(thread.post)
        .mock.calls.every((call) => !String(call[FIRST_CALL_ARG]).includes(WORKFLOW_ERROR_MESSAGE)),
    ).toBe(true);
    // Verify createLinearIssue was NOT called (not the complete branch)
    expect(mockCreateIssue!.execute).not.toHaveBeenCalled();
  });

  /**
   * Branch 3: Exhausted rounds or no question → escalateStep unsubscribes and
   * throws an InsufficientBugDetailError (Mastra resolves the run as `failed`);
   * the coordinator classifies it and posts the insufficient-detail reply.
   */
  it("escalates and notifies the reporter when rounds are exhausted", async () => {
    const messages = [
      makeTestMessage("Bug report", false),
      makeTestMessage("Q1", true),
      makeTestMessage("A1", false),
      makeTestMessage("Q2", true),
      makeTestMessage("A2", false),
      makeTestMessage("Q3", true),
      makeTestMessage("A3", false),
      makeTestMessage("Q4", true),
      makeTestMessage("A4", false),
      makeTestMessage("Q5", true),
      makeTestMessage("A5", false),
    ];
    const thread = makeThread(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockResolvedValueOnce({
      isComplete: false,
      clarifyingQuestion: "One more thing?", // still has a question
      // botTurns = 5 (Q1-Q5), which is >= MAX_CLARIFICATION_ROUNDS (5)
    });

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // escalateStep unsubscribed then threw → coordinator posted the generic reply
    expect(thread.post).toHaveBeenCalledWith(WORKFLOW_ERROR_MESSAGE);
    // Verify unsubscribe was called (escalateStep stops the clarify loop)
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
    // Verify createLinearIssue was NOT called (not complete)
    expect(mockCreateIssue!.execute).not.toHaveBeenCalled();
  });

  /**
   * Branch 3 variant: No clarifying question → escalateStep unsubscribes and
   * throws; the coordinator posts the insufficient-detail reply.
   */
  it("escalates and notifies the reporter when no clarifying question can be formed", async () => {
    const messages = [
      makeTestMessage("Some text", false),
      makeTestMessage("Bot question", true),
      makeTestMessage("User response", false),
    ];
    const thread = makeThread(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockResolvedValueOnce({
      isComplete: false,
      clarifyingQuestion: null, // no question to ask
      // botTurns = 1, which is < MAX_CLARIFICATION_ROUNDS (5)
    });

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // escalateStep unsubscribed then threw → coordinator posted the generic reply
    expect(thread.post).toHaveBeenCalledWith(WORKFLOW_ERROR_MESSAGE);
    // Verify unsubscribe was called (escalateStep stops the clarify loop)
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
    // Verify createLinearIssue was NOT called (not complete)
    expect(mockCreateIssue!.execute).not.toHaveBeenCalled();
  });
});
