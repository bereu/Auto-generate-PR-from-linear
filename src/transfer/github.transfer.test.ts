import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockPullsList = vi.fn();

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    pulls = { list: mockPullsList };
  },
}));

import { GithubTransfer } from "@/transfer/github.transfer";

function setupGithubTransfer(): { transfer: GithubTransfer; originalToken: string | undefined } {
  mockPullsList.mockReset();
  const originalToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "test-token";
  const transfer = new GithubTransfer();
  return { transfer, originalToken };
}

function restoreToken(originalToken: string | undefined): void {
  if (originalToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalToken;
  }
}

describe("GithubTransfer.fetchPrUrl - successful PR fetch", () => {
  let transfer: GithubTransfer;
  let originalToken: string | undefined;

  beforeEach(() => {
    ({ transfer, originalToken } = setupGithubTransfer());
  });

  afterEach(() => {
    restoreToken(originalToken);
  });

  it("returns PR URL when PR exists", async () => {
    mockPullsList.mockResolvedValue({
      data: [{ html_url: "https://github.com/org/repo/pull/42" }],
    });
    const result = await transfer.fetchPrUrl("org/repo", "claude/issue-123");
    expect(result).toBe("https://github.com/org/repo/pull/42");
  });

  it("returns null when no PRs found", async () => {
    mockPullsList.mockResolvedValue({ data: [] });
    const result = await transfer.fetchPrUrl("org/repo", "claude/issue-123");
    expect(result).toBeNull();
  });
});

describe("GithubTransfer.fetchPrUrl - error handling", () => {
  let transfer: GithubTransfer;
  let originalToken: string | undefined;

  beforeEach(() => {
    ({ transfer, originalToken } = setupGithubTransfer());
  });

  afterEach(() => {
    restoreToken(originalToken);
  });

  it("returns null when API call throws", async () => {
    mockPullsList.mockRejectedValue(new Error("API error"));
    const result = await transfer.fetchPrUrl("org/repo", "claude/issue-123");
    expect(result).toBeNull();
  });

  it("throws when repoFullName has no slash", async () => {
    await expect(transfer.fetchPrUrl("invalid-repo", "branch")).rejects.toThrow(
      "repoFullName must be in 'owner/repo' format",
    );
  });
});
