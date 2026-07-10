import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Message, Thread } from "chat";

vi.mock("chat", () => ({ Chat: vi.fn() }));
vi.mock("@chat-adapter/slack", () => ({ createSlackAdapter: vi.fn() }));
vi.mock("@chat-adapter/state-memory", () => ({ createMemoryState: vi.fn() }));
vi.mock("ai", () => ({ generateObject: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ anthropic: vi.fn(() => "mock-model") }));

import { SlackBotCoordinator } from "@/slack-triage/coordinator/slack-bot.coordinator";
import type { SlackTransfer } from "@/transfer/slack.transfer";
import type { ClassifyMessageQuery } from "@/slack-triage/query/classify-message.query";
import type { AnswerQuestionQuery } from "@/slack-triage/query/answer-question.query";
import type { EvaluateBugReportQuery } from "@/slack-triage/query/evaluate-bug-report.query";
import type { EvaluateFeatureRequestQuery } from "@/slack-triage/query/evaluate-feature-request.query";
import type { CreateLinearIssueCommand } from "@/slack-triage/command/create-linear-issue.command";
import { makeTestMessage } from "@/test/message-helper";
import {
  WORKFLOW_ERROR_MESSAGE,
  ERROR_RESPONSE_MESSAGES,
  buildMaxRoundsIssueCreatedMessage,
  buildIssueCreatedMessage,
  MAX_CLARIFICATION_ROUNDS,
} from "@/slack-triage/slack-triage.constants";
import { generateObject } from "ai";

const FIRST_CALL_ARG = 0;

type PostMock = { mock: { calls: unknown[][] } };

/**
 * True if the generic workflow error message was ever posted to the thread.
 * Type-safe: non-string post args (PostableMessage/ChatElement) can't match.
 */
const postedGenericError = (thread: Thread): boolean =>
  (thread.post as unknown as PostMock).mock.calls.some(
    (call) =>
      typeof call[FIRST_CALL_ARG] === "string" &&
      call[FIRST_CALL_ARG].includes(WORKFLOW_ERROR_MESSAGE),
  );

/**
 * Build a thread history that reaches MAX_CLARIFICATION_ROUNDS (5 bot turns):
 * initial report + Q1..Q5 (bot) interleaved with A1..A5 (user). botTurns = 5.
 */
function makeMaxRoundsMessages(): Message[] {
  const messages: Message[] = [makeTestMessage("Bug report", false)];
  for (let round = 1; round <= MAX_CLARIFICATION_ROUNDS; round++) {
    messages.push(makeTestMessage(`Q${round}`, true), makeTestMessage(`A${round}`, false));
  }
  return messages;
}

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
  const mockClassifyMessage = { execute: vi.fn() };
  const mockAnswerQuestion = { execute: vi.fn() };
  const mockEvaluate: Partial<EvaluateBugReportQuery> = { execute: vi.fn() };
  const mockEvaluateFeature = { execute: vi.fn() };
  const mockCreateIssue: Partial<CreateLinearIssueCommand> = { execute: vi.fn() };
  const coordinator = new SlackBotCoordinator(
    mockSlackTransfer as SlackTransfer,
    mockClassifyMessage as unknown as ClassifyMessageQuery,
    mockAnswerQuestion as unknown as AnswerQuestionQuery,
    mockEvaluate as EvaluateBugReportQuery,
    mockEvaluateFeature as unknown as EvaluateFeatureRequestQuery,
    mockCreateIssue as CreateLinearIssueCommand,
  );
  return {
    coordinator,
    mockSlackTransfer,
    mockEvaluate,
    mockCreateIssue,
  };
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
    expect(mockCreateIssue!.execute).toHaveBeenCalledWith(messages, "medium", "bug");
    expect(thread.post).toHaveBeenCalledWith(
      buildIssueCreatedMessage("https://linear.app/issue/123"),
    );
    // Verify unsubscribe was called (sign of createIssueStep, not other branches)
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
    // Verify fallback message was NOT posted (would indicate duplicate response bug)
    expect(postedGenericError(thread)).toBe(false);
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
    expect(postedGenericError(thread)).toBe(false);
    // Verify createLinearIssue was NOT called (not the complete branch)
    expect(mockCreateIssue!.execute).not.toHaveBeenCalled();
  });

  /**
   * Branch 3: Max-rounds path (botTurns >= MAX_CLARIFICATION_ROUNDS with incomplete report).
   * Even if a clarifying question exists, maxRoundsCondition takes precedence.
   * The workflow assesses complexity and creates a best-effort Linear issue,
   * posting the partial-detail message to the reporter.
   */
  it("creates issue and posts partial-detail message when max rounds are reached", async () => {
    const messages = makeMaxRoundsMessages();
    const thread = makeThread(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockResolvedValueOnce({
      isComplete: false,
      clarifyingQuestion: "One more thing?", // still has a question, but max rounds takes precedence
      // botTurns = 5 (Q1-Q5), which is >= MAX_CLARIFICATION_ROUNDS (5)
    });
    // Mock generateObject for complexity assessment in assessComplexityStep
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(generateObject as any).mockResolvedValueOnce({
      object: { difficulty: "medium" },
    });
    // Mock createLinearIssue to return a URL
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockCreateIssue!.execute as any).mockResolvedValueOnce({
      url: "https://linear.app/issue/456",
    });

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // Verify createIssueOnMaxRoundsStep ran: complexity assessed and issue created
    expect(mockCreateIssue!.execute).toHaveBeenCalledWith(messages, "medium", "bug");
    // Verify the partial-detail message was posted (distinct from the normal "Linear issue created" message)
    const expectedMessage = buildMaxRoundsIssueCreatedMessage("https://linear.app/issue/456");
    expect(thread.post).toHaveBeenCalledWith(expectedMessage);
    // Verify unsubscribe was called (maxRoundsWorkflow stops the clarify loop)
    expect(thread.unsubscribe).toHaveBeenCalledOnce();
    // Verify generic failure message was NOT posted (max rounds is a success path, not an error)
    expect(postedGenericError(thread)).toBe(false);
  });

  /**
   * Branch 4: Escalate edge case (incomplete + rounds remaining + no clarifying question).
   * This is an unrecoverable state: the report is incomplete, rounds remain, but the agent
   * cannot form a clarifying question. The escalateStep throws an InsufficientBugDetailError
   * (Mastra resolves the run as `failed`); the coordinator classifies it and posts the
   * insufficient-detail reply.
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

  /**
   * Branch 3 error case: Linear API fails on the max-rounds path.
   * The createIssueOnMaxRoundsStep receives an error when calling CreateLinearIssueCommand.
   * The coordinator classifies it as a system error and posts the linearCreationFailed reply.
   * BE-003: system error → logged at `error` level.
   */
  it("posts Linear-failure reply when issue creation fails on the max-rounds path", async () => {
    const messages = makeMaxRoundsMessages();
    const thread = makeThread(messages);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockEvaluate!.execute as any).mockResolvedValueOnce({
      isComplete: false,
      clarifyingQuestion: "One more thing?",
      // botTurns = 5 (Q1-Q5), which is >= MAX_CLARIFICATION_ROUNDS (5)
    });
    // Mock generateObject for complexity assessment
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(generateObject as any).mockResolvedValueOnce({
      object: { difficulty: "medium" },
    });
    // Mock createLinearIssue to reject with a Linear error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(mockCreateIssue!.execute as any).mockRejectedValueOnce(
      new Error("Linear issue creation failed"),
    );

    await (coordinator as unknown as { handleIncoming(t: Thread): Promise<void> }).handleIncoming(
      thread,
    );

    // Coordinator classifies the error and posts the Linear-specific reply
    expect(thread.post).toHaveBeenCalledWith(ERROR_RESPONSE_MESSAGES.linearCreationFailed);
  });
});
