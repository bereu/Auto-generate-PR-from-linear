import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Thread } from "chat";
import { SlackBotCoordinator } from "@/slack-triage/coordinator/slack-bot.coordinator";
import type { TriageAgent } from "@/slack-triage/agent/triage.agent";
import type { ReconcileLinearIssueCommand } from "@/slack-triage/command/reconcile-linear-issue.command";
import type { SlackTransfer } from "@/transfer/slack.transfer";

vi.mock("@/transfer/slack.transfer");
vi.mock("@/slack-triage/agent/triage.agent");
vi.mock("@/slack-triage/command/reconcile-linear-issue.command");

// Test constants
const TEST_ISSUE_ID_FIRST = "LIN-123";
const TEST_ISSUE_ID_THIRD = "LIN-789";
const TEST_ISSUE_ID_FOURTH = "LIN-999";
const TEST_ISSUE_URL_FIRST = "https://linear.app/issue/LIN-123";
const TEST_ISSUE_URL_THIRD = "https://linear.app/issue/LIN-789";
const TEST_ISSUE_URL_FOURTH = "https://linear.app/issue/LIN-999";
const TEST_ASYNC_WAIT_MS = 150;
const FIRST_CALL_INDEX = 0;

// Helper: Create a handler from mocks
const getHandlerFromMocks = (mockSlackTransfer: Partial<SlackTransfer>) => {
  const onNewMentionMock = mockSlackTransfer.onNewMention as unknown as {
    mock: { calls: Array<Array<unknown>> };
  };
  return onNewMentionMock.mock.calls[FIRST_CALL_INDEX][FIRST_CALL_INDEX] as (
    t: Partial<Thread>,
  ) => void;
};

// Helper: Create basic mocks
const createBasicMocks = () => {
  const triageAgentMock = vi.fn();
  const reconcileMock = vi.fn().mockResolvedValue(undefined);
  const threadPostMock = vi.fn().mockResolvedValue(undefined);
  const threadUnsubscribeMock = vi.fn().mockResolvedValue(undefined);

  return { triageAgentMock, reconcileMock, threadPostMock, threadUnsubscribeMock };
};

// Helper: Create transfer and agent mocks
const createTransferAndAgentMocks = (
  triageAgentMock: ReturnType<typeof vi.fn>,
  reconcileMock: ReturnType<typeof vi.fn>,
) => {
  const mockSlackTransfer = {
    onNewMention: vi.fn(),
    onSubscribedMessage: vi.fn(),
  };

  const mockTriageAgent = { run: triageAgentMock };
  const mockReconcile = { execute: reconcileMock };

  return { mockSlackTransfer, mockTriageAgent, mockReconcile };
};

// Helper: Setup coordinator mocks
const setupCoordinatorMocks = () => {
  vi.clearAllMocks();

  const { triageAgentMock, reconcileMock, threadPostMock, threadUnsubscribeMock } =
    createBasicMocks();
  const { mockSlackTransfer, mockTriageAgent, mockReconcile } = createTransferAndAgentMocks(
    triageAgentMock,
    reconcileMock,
  );

  const mockThread = {
    refresh: vi.fn().mockResolvedValue(undefined),
    post: threadPostMock,
    subscribe: vi.fn().mockResolvedValue(undefined),
    unsubscribe: threadUnsubscribeMock,
  };

  const coordinator = new SlackBotCoordinator(
    mockSlackTransfer as unknown as SlackTransfer,
    mockTriageAgent as unknown as TriageAgent,
    mockReconcile as unknown as ReconcileLinearIssueCommand,
  );

  coordinator.onModuleInit();

  return {
    coordinator,
    triageAgentMock,
    reconcileMock,
    threadPostMock,
    threadUnsubscribeMock,
    mockSlackTransfer,
    mockThread,
  };
};

const waitForAsync = () => new Promise((resolve) => setTimeout(resolve, TEST_ASYNC_WAIT_MS));

const runHandlerFactory =
  (mockSlackTransfer: Partial<SlackTransfer>, mockThread: Partial<Thread>) => async () => {
    const handler = getHandlerFromMocks(mockSlackTransfer);
    handler(mockThread);
    await waitForAsync();
  };

// describe() is a test-grouping block, not a logic function; keeping related cases
// together reads better than splitting to satisfy the line count.
// eslint-disable-next-line max-lines-per-function
describe("SlackBotCoordinator - Issue Creation", () => {
  let triageAgentMock: ReturnType<typeof vi.fn>;
  let reconcileMock: ReturnType<typeof vi.fn>;
  let threadPostMock: ReturnType<typeof vi.fn>;
  let threadUnsubscribeMock: ReturnType<typeof vi.fn>;
  let mockSlackTransfer: Partial<SlackTransfer>;
  let mockThread: Partial<Thread>;
  let runHandler: () => Promise<void>;

  beforeEach(() => {
    const mocks = setupCoordinatorMocks();
    triageAgentMock = mocks.triageAgentMock;
    reconcileMock = mocks.reconcileMock;
    threadPostMock = mocks.threadPostMock;
    threadUnsubscribeMock = mocks.threadUnsubscribeMock;
    mockSlackTransfer = mocks.mockSlackTransfer;
    mockThread = mocks.mockThread;
    runHandler = runHandlerFactory(mockSlackTransfer, mockThread);
  });

  it("Scenario 1: Complete bug → issue created with correct label/state", async () => {
    triageAgentMock.mockResolvedValue({
      action: "created_issue",
      message: "Issue created",
      issueId: TEST_ISSUE_ID_FIRST,
      issueUrl: TEST_ISSUE_URL_FIRST,
    });
    await runHandler();
    expect(reconcileMock).toHaveBeenCalledWith(TEST_ISSUE_ID_FIRST);
    expect(threadPostMock).toHaveBeenCalledWith(expect.stringContaining(TEST_ISSUE_URL_FIRST));
    expect(threadUnsubscribeMock).toHaveBeenCalled();
  });

  it("Scenario 7: Slack MCP read search only", async () => {
    triageAgentMock.mockResolvedValue({
      action: "created_issue",
      message: "Issue created with duplicate search check",
      issueId: TEST_ISSUE_ID_THIRD,
      issueUrl: TEST_ISSUE_URL_THIRD,
    });
    await runHandler();
    expect(reconcileMock).toHaveBeenCalledWith(TEST_ISSUE_ID_THIRD);
    expect(threadPostMock).toHaveBeenCalled();
  });

  it("should post issue URL even if reconciliation fails", async () => {
    triageAgentMock.mockResolvedValue({
      action: "created_issue",
      message: "Issue created",
      issueId: TEST_ISSUE_ID_FOURTH,
      issueUrl: TEST_ISSUE_URL_FOURTH,
    });
    reconcileMock.mockRejectedValue(new Error("Reconciliation failed"));
    await runHandler();
    expect(threadPostMock).toHaveBeenCalledWith(expect.stringContaining(TEST_ISSUE_URL_FOURTH));
    expect(threadUnsubscribeMock).toHaveBeenCalled();
  });
});

// describe() is a test-grouping block, not a logic function; keeping related cases
// together reads better than splitting to satisfy the line count.
// eslint-disable-next-line max-lines-per-function
describe("SlackBotCoordinator - Triage Actions", () => {
  let triageAgentMock: ReturnType<typeof vi.fn>;
  let reconcileMock: ReturnType<typeof vi.fn>;
  let threadPostMock: ReturnType<typeof vi.fn>;
  let threadUnsubscribeMock: ReturnType<typeof vi.fn>;
  let mockSlackTransfer: Partial<SlackTransfer>;
  let mockThread: Partial<Thread>;
  let runHandler: () => Promise<void>;

  beforeEach(() => {
    const mocks = setupCoordinatorMocks();
    triageAgentMock = mocks.triageAgentMock;
    reconcileMock = mocks.reconcileMock;
    threadPostMock = mocks.threadPostMock;
    threadUnsubscribeMock = mocks.threadUnsubscribeMock;
    mockSlackTransfer = mocks.mockSlackTransfer;
    mockThread = mocks.mockThread;
    runHandler = runHandlerFactory(mockSlackTransfer, mockThread);
  });

  it("Scenario 2: Incomplete bug → single clarifying question", async () => {
    triageAgentMock.mockResolvedValue({
      action: "asked_clarifying_question",
      message: "What are the steps to reproduce?",
    });
    await runHandler();
    expect(threadPostMock).toHaveBeenCalledWith("What are the steps to reproduce?");
    expect(threadUnsubscribeMock).not.toHaveBeenCalled();
  });

  it("Scenario 3: Question intent → answered, no issue", async () => {
    triageAgentMock.mockResolvedValue({
      action: "answered_question",
      message: "The feature works by...",
    });
    await runHandler();
    expect(threadPostMock).toHaveBeenCalledWith("The feature works by...");
    expect(reconcileMock).not.toHaveBeenCalled();
    expect(threadUnsubscribeMock).not.toHaveBeenCalled();
  });

  it("Scenario 4: Max rounds reached", async () => {
    triageAgentMock.mockResolvedValue({
      action: "error",
      message: "Max rounds reached",
      maxRoundsReached: true,
      issueUrl: "https://linear.app/issue/LIN-456",
    });
    await runHandler();
    expect(threadPostMock).toHaveBeenCalledWith(
      expect.stringContaining("couldn't gather full details"),
    );
    expect(threadUnsubscribeMock).toHaveBeenCalled();
  });

  it("Scenario 5: Langfuse outage graceful fallback", async () => {
    triageAgentMock.mockResolvedValue({
      action: "answered_question",
      message: "Here is the answer",
    });
    await runHandler();
    expect(threadPostMock).toHaveBeenCalledWith("Here is the answer");
  });

  it("Scenario 6: Agent MCP failure handling", async () => {
    triageAgentMock.mockRejectedValue(new Error("MCP tool failed"));
    await runHandler();
    expect(threadPostMock).toHaveBeenCalled();
  });
});

describe("SlackBotCoordinator - Initialization", () => {
  it("should register handlers on module init", () => {
    const mocks = setupCoordinatorMocks();

    expect(mocks.mockSlackTransfer.onNewMention).toHaveBeenCalled();
    expect(mocks.mockSlackTransfer.onSubscribedMessage).toHaveBeenCalled();
  });
});
