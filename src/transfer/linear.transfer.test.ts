import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockIssue = vi.fn();

vi.mock("@linear/sdk", () => ({
  LinearClient: class {
    issue = mockIssue;
  },
}));

import { LinearTransfer } from "@/transfer/linear.transfer";

function setupLinearTransfer(): {
  transfer: LinearTransfer;
  originalApiKey: string | undefined;
} {
  mockIssue.mockReset();
  const originalApiKey = process.env.LINEAR_API_KEY;
  process.env.LINEAR_API_KEY = "test-key";
  const transfer = new LinearTransfer();
  return { transfer, originalApiKey };
}

function restoreApiKey(originalApiKey: string | undefined): void {
  if (originalApiKey === undefined) {
    delete process.env.LINEAR_API_KEY;
  } else {
    process.env.LINEAR_API_KEY = originalApiKey;
  }
}

describe("LinearTransfer.fetchComments - with comments", () => {
  let transfer: LinearTransfer;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    ({ transfer, originalApiKey } = setupLinearTransfer());
  });

  afterEach(() => {
    restoreApiKey(originalApiKey);
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
});

describe("LinearTransfer.fetchComments - without comments", () => {
  let transfer: LinearTransfer;
  let originalApiKey: string | undefined;

  beforeEach(() => {
    ({ transfer, originalApiKey } = setupLinearTransfer());
  });

  afterEach(() => {
    restoreApiKey(originalApiKey);
  });

  it("returns empty array when issue has no comments", async () => {
    mockIssue.mockResolvedValue({
      comments: vi.fn().mockResolvedValue({ nodes: [] }),
    });

    const result = await transfer.fetchComments("issue-123");
    expect(result).toEqual([]);
  });
});
