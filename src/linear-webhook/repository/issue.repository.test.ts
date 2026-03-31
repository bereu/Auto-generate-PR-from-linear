import { describe, it, expect, vi, beforeEach } from "vitest";
import { IssueRepository } from "@/linear-webhook/repository/issue.repository";
import type { LinearTransfer } from "@/transfer/linear.transfer";
import type { GithubTransfer } from "@/transfer/github.transfer";
import { AGENT_MESSAGES } from "@/constants/message/success/agent.message";

describe("IssueRepository.hasStartingComment", () => {
  let repository: IssueRepository;
  let mockTransfer: Partial<LinearTransfer>;
  const mockGithubTransfer = {} as GithubTransfer;

  beforeEach(() => {
    mockTransfer = { fetchComments: vi.fn() };
    repository = new IssueRepository(mockTransfer as LinearTransfer, mockGithubTransfer);
  });

  it("returns true when starting comment exists", async () => {
    vi.mocked(mockTransfer.fetchComments!).mockResolvedValue([
      AGENT_MESSAGES.agentStarting,
      "Some other comment",
    ]);
    const result = await repository.hasStartingComment("issue-123");
    expect(result).toBe(true);
  });

  it("returns false when no starting comment exists", async () => {
    vi.mocked(mockTransfer.fetchComments!).mockResolvedValue(["Some other comment"]);
    const result = await repository.hasStartingComment("issue-123");
    expect(result).toBe(false);
  });

  it("returns false when issue has no comments", async () => {
    vi.mocked(mockTransfer.fetchComments!).mockResolvedValue([]);
    const result = await repository.hasStartingComment("issue-123");
    expect(result).toBe(false);
  });
});

describe("IssueRepository.fetchPrUrl", () => {
  it("delegates to GithubTransfer.fetchPrUrl with the same arguments", async () => {
    const mockFetchPrUrl = vi.fn().mockResolvedValue("https://github.com/org/repo/pull/1");
    const mockGithubTransfer = { fetchPrUrl: mockFetchPrUrl } as unknown as GithubTransfer;
    const repository = new IssueRepository({} as LinearTransfer, mockGithubTransfer);

    const result = await repository.fetchPrUrl("org/repo", "claude/issue-1");

    expect(mockFetchPrUrl).toHaveBeenCalledWith("org/repo", "claude/issue-1");
    expect(result).toBe("https://github.com/org/repo/pull/1");
  });
});
