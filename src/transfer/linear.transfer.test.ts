import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockIssue = vi.fn();

vi.mock("@linear/sdk", () => ({
  LinearClient: class {
    issue = mockIssue;
  },
}));

import { LinearTransfer } from "@/transfer/linear.transfer";

describe("LinearTransfer.fetchComments", () => {
  let transfer: LinearTransfer;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    mockIssue.mockReset();
    originalApiKey = process.env.LINEAR_API_KEY;
    process.env.LINEAR_API_KEY = "test-key";
    transfer = new LinearTransfer();
  });

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = originalApiKey;
    }
  });

  it("returns comment bodies for an issue", async () => {
    mockIssue.mockResolvedValue({
      comments: vi.fn().mockResolvedValue({
        nodes: [{ body: "Agent starting implementation" }, { body: "Some other comment" }],
      }),
    });

    const result = await transfer.fetchComments("issue-123");
    expect(result).toEqual(["Agent starting implementation", "Some other comment"]);
  });

  it("returns empty array when issue has no comments", async () => {
    mockIssue.mockResolvedValue({
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
    });

    const result = await transfer.fetchComments("issue-123");
    expect(result).toEqual([]);
  });
});
