import { describe, it, expect, beforeEach, vi } from "vitest";
import { ReconcileLinearIssueCommand } from "@/slack-triage/command/reconcile-linear-issue.command";
import { LinearTransfer } from "@/transfer/linear.transfer";
import { LINEAR_AGENT_LABEL } from "@/slack-triage/slack-triage.constants";

// Test constants
const TEST_ISSUE_ID = "LIN-123";
const TEST_ISSUE_TITLE = "Bug report";
const TEST_ISSUE_DESCRIPTION = "Description";
const TEST_ISSUE_URL = "https://linear.app/issue/LIN-123";
const TEST_ISSUE_STATE_TODO = "Todo";
const TEST_ISSUE_STATE_BACKLOG = "Backlog";
const TEST_LABEL_BUG = "bug";

// Helper: Setup mocks
const setupMocks = () => {
  const mockTransfer = {
    fetchIssueById: vi.fn(),
    addLabel: vi.fn(),
    changeState: vi.fn(),
  };
  const command = new ReconcileLinearIssueCommand(mockTransfer as unknown as LinearTransfer);
  return { command, mockTransfer };
};

// Helper: Create a resolved issue mock
const createIssueMock = (labels: string[], state: string) => ({
  id: TEST_ISSUE_ID,
  title: TEST_ISSUE_TITLE,
  description: TEST_ISSUE_DESCRIPTION,
  url: TEST_ISSUE_URL,
  labels,
  state,
});

// describe() is a test-grouping block, not a logic function; keeping related cases
// together reads better than splitting to satisfy the line count.
// eslint-disable-next-line max-lines-per-function
describe("ReconcileLinearIssueCommand - Happy Path", () => {
  let command: ReconcileLinearIssueCommand;
  let mockTransfer: {
    fetchIssueById: ReturnType<typeof vi.fn>;
    addLabel: ReturnType<typeof vi.fn>;
    changeState: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    const setup = setupMocks();
    command = setup.command;
    mockTransfer = setup.mockTransfer;
  });

  it("should verify issue exists and has agent label and Todo state", async () => {
    (mockTransfer.fetchIssueById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createIssueMock([LINEAR_AGENT_LABEL], TEST_ISSUE_STATE_TODO),
    );
    await command.execute(TEST_ISSUE_ID);
    expect(mockTransfer.fetchIssueById).toHaveBeenCalledWith(TEST_ISSUE_ID);
    expect(mockTransfer.addLabel).not.toHaveBeenCalled();
    expect(mockTransfer.changeState).not.toHaveBeenCalled();
  });

  it("should add agent label if missing", async () => {
    (mockTransfer.fetchIssueById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createIssueMock([TEST_LABEL_BUG], TEST_ISSUE_STATE_TODO),
    );
    await command.execute(TEST_ISSUE_ID);
    expect(mockTransfer.addLabel).toHaveBeenCalledWith(TEST_ISSUE_ID, LINEAR_AGENT_LABEL);
  });

  it("should change state to Todo if not Todo", async () => {
    (mockTransfer.fetchIssueById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createIssueMock([LINEAR_AGENT_LABEL], TEST_ISSUE_STATE_BACKLOG),
    );
    await command.execute(TEST_ISSUE_ID);
    expect(mockTransfer.changeState).toHaveBeenCalledWith(TEST_ISSUE_ID, TEST_ISSUE_STATE_TODO);
  });

  it("should add label and change state if both are missing", async () => {
    (mockTransfer.fetchIssueById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createIssueMock([TEST_LABEL_BUG], TEST_ISSUE_STATE_BACKLOG),
    );
    await command.execute(TEST_ISSUE_ID);
    expect(mockTransfer.addLabel).toHaveBeenCalledWith(TEST_ISSUE_ID, LINEAR_AGENT_LABEL);
    expect(mockTransfer.changeState).toHaveBeenCalledWith(TEST_ISSUE_ID, TEST_ISSUE_STATE_TODO);
  });
});

// describe() is a test-grouping block, not a logic function; keeping related cases
// together reads better than splitting to satisfy the line count.
// eslint-disable-next-line max-lines-per-function
describe("ReconcileLinearIssueCommand - Error Cases", () => {
  let command: ReconcileLinearIssueCommand;
  let mockTransfer: {
    fetchIssueById: ReturnType<typeof vi.fn>;
    addLabel: ReturnType<typeof vi.fn>;
    changeState: ReturnType<typeof vi.fn>;
  };
  beforeEach(() => {
    vi.clearAllMocks();
    const setup = setupMocks();
    command = setup.command;
    mockTransfer = setup.mockTransfer;
  });

  it("should throw error if issue not found", async () => {
    (mockTransfer.fetchIssueById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(command.execute("LIN-999")).rejects.toThrow("not found");
  });

  it("should throw error if addLabel fails", async () => {
    (mockTransfer.fetchIssueById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createIssueMock([TEST_LABEL_BUG], TEST_ISSUE_STATE_TODO),
    );
    (mockTransfer.addLabel as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Failed to add label"),
    );
    await expect(command.execute(TEST_ISSUE_ID)).rejects.toThrow("Failed to add label");
  });

  it("should throw error if changeState fails", async () => {
    (mockTransfer.fetchIssueById as ReturnType<typeof vi.fn>).mockResolvedValue(
      createIssueMock([LINEAR_AGENT_LABEL], TEST_ISSUE_STATE_BACKLOG),
    );
    (mockTransfer.changeState as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Failed to change state"),
    );
    await expect(command.execute(TEST_ISSUE_ID)).rejects.toThrow("Failed to change state");
  });
});
