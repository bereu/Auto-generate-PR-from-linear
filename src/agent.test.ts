import { describe, it, expect, vi, beforeEach } from "vitest";

// ── hoisted mock variables (available to vi.mock factories) ──────────────────
const {
  mockQuery,
  mockAddComment,
  mockResetToPending,
  mockStartImplementation,
  mockMarkReadyForReview,
  mockHasStartingComment,
  mockFetchPrUrl,
  mockSuspendCommandSuspend,
} = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockAddComment: vi.fn().mockResolvedValue(undefined),
  mockResetToPending: vi.fn().mockResolvedValue(undefined),
  mockStartImplementation: vi.fn().mockResolvedValue(undefined),
  mockMarkReadyForReview: vi.fn().mockResolvedValue(undefined),
  mockHasStartingComment: vi.fn().mockResolvedValue(false),
  mockFetchPrUrl: vi.fn().mockResolvedValue("https://github.com/org/repo/pull/1"),
  mockSuspendCommandSuspend: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({ query: mockQuery }));

vi.mock("@/sync-repos", () => ({
  prepareWorktree: vi.fn(() => ({ wtPath: "/tmp/wt", workBranch: "claude/issue-1" })),
  cleanupWorktree: vi.fn(),
}));

vi.mock("@/linear", () => ({
  resolveRepo: vi.fn(() => "test-repo"),
}));

vi.mock("@/repos.config", () => ({
  REPOS: [{ name: "test-repo", org: "test-org" }],
  MAX_TURNS: 10,
  LOG_TRUNCATE_LENGTH: 200,
}));

vi.mock("@/util/prompt-loader", () => ({
  promptLoader: { load: vi.fn(() => "mocked prompt") },
}));

vi.mock("@/linear-webhook/repository/issue.repository", () => ({
  IssueRepository: vi.fn(function (this: unknown) {
    Object.assign(this as object, {
      addComment: mockAddComment,
      resetToPending: mockResetToPending,
      startImplementation: mockStartImplementation,
      markReadyForReview: mockMarkReadyForReview,
      hasStartingComment: mockHasStartingComment,
      fetchPrUrl: mockFetchPrUrl,
      suspend: vi.fn().mockResolvedValue(undefined),
      updateTitle: vi.fn().mockResolvedValue(undefined),
    });
  }),
}));

vi.mock("@/linear-webhook/command/suspend-issue.command", () => ({
  SuspendIssueCommand: vi.fn(function (this: unknown) {
    Object.assign(this as object, { suspend: mockSuspendCommandSuspend });
  }),
}));

vi.mock("@/transfer/linear.transfer", () => ({ LinearTransfer: vi.fn() }));
vi.mock("@/transfer/github.transfer", () => ({ GithubTransfer: vi.fn() }));

// ── import after mocks ──────────────────────────────────────────────────────
import { processIssue } from "@/agent";
import { LinearIssue } from "@/domain/issue/linear-issue";
import {
  MaxTurnsReachedError,
  ClaudeTerminatedError,
  UnknownRepoError,
} from "@/constants/errors/business.error";
import { AGENT_MESSAGES } from "@/constants/message/success/agent.message";
import { CLAUDE_RESULT_SUBTYPES } from "@/constants/agent.constants";
import { resolveRepo } from "@/linear";

// ── helpers ──────────────────────────────────────────────────────────────────
function makeIssue(): LinearIssue {
  return LinearIssue.reconstruct("issue-1", "Fix bug", "desc", "https://linear.app/issue-1", [
    "claude",
  ]);
}

function mockQueryYields(messages: unknown[]): void {
  mockQuery.mockImplementation(async function* () {
    for (const msg of messages) {
      yield msg;
    }
  });
}

// ── tests ────────────────────────────────────────────────────────────────────
describe("processIssue catch-block branching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddComment.mockResolvedValue(undefined);
    mockResetToPending.mockResolvedValue(undefined);
    mockStartImplementation.mockResolvedValue(undefined);
    mockMarkReadyForReview.mockResolvedValue(undefined);
    mockHasStartingComment.mockResolvedValue(false);
    mockFetchPrUrl.mockResolvedValue("https://github.com/org/repo/pull/1");
    mockSuspendCommandSuspend.mockResolvedValue(undefined);
    vi.mocked(resolveRepo).mockReturnValue("test-repo");
  });

  it("MaxTurnsReachedError: does NOT call resetToPending", async () => {
    mockQueryYields([{ type: "result", subtype: CLAUDE_RESULT_SUBTYPES.errorMaxTurns }]);

    await expect(processIssue(makeIssue())).rejects.toBeInstanceOf(MaxTurnsReachedError);

    expect(mockResetToPending).not.toHaveBeenCalled();
    expect(mockSuspendCommandSuspend).toHaveBeenCalled();
  });

  it("ClaudeTerminatedError: suspends issue, adds comment, does NOT call resetToPending", async () => {
    mockQueryYields([]);

    await expect(processIssue(makeIssue())).rejects.toBeInstanceOf(ClaudeTerminatedError);

    expect(mockResetToPending).not.toHaveBeenCalled();
    expect(mockSuspendCommandSuspend).toHaveBeenCalled();
    expect(mockAddComment).toHaveBeenCalledWith("issue-1", AGENT_MESSAGES.agentTerminated);
  });

  it("UnknownRepoError: adds comment, does NOT call resetToPending", async () => {
    vi.mocked(resolveRepo).mockReturnValue("nonexistent-repo");

    await expect(processIssue(makeIssue())).rejects.toBeInstanceOf(UnknownRepoError);

    expect(mockResetToPending).not.toHaveBeenCalled();
    expect(mockAddComment).toHaveBeenCalledWith(
      "issue-1",
      expect.stringContaining("Agent stopped:"),
    );
  });

  it("generic Error: adds agentFailed comment then calls resetToPending", async () => {
    mockQueryYields([{ type: "result", subtype: CLAUDE_RESULT_SUBTYPES.success }]);
    mockMarkReadyForReview.mockRejectedValue(new Error("Linear API down"));

    await expect(processIssue(makeIssue())).rejects.toThrow("Linear API down");

    expect(mockAddComment).toHaveBeenCalledWith(
      "issue-1",
      expect.stringContaining("Agent failed with system error:"),
    );
    expect(mockResetToPending).toHaveBeenCalledWith("issue-1");
  });
});
