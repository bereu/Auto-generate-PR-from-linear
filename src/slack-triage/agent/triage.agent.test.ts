import type { query as QueryType } from "@anthropic-ai/claude-agent-sdk";
import type { Thread } from "chat";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { TriageAgent } from "@/slack-triage/agent/triage.agent";
import { langfuse } from "@/util/langfuse";
import { logger } from "@/util/logger";

vi.mock("@/util/langfuse");
vi.mock("@/util/logger");
vi.mock("@anthropic-ai/claude-agent-sdk", () => {
  return {
    query: vi.fn(),
  };
});

// Test constants
const MOCK_ISSUE_ID = "ENG-42";
const MOCK_ISSUE_URL = "https://linear.app/issue/ENG-42";
const MOCK_DIFFICULTY = "easy";
const MOCK_USER_TEXT = "I found a bug";
const MOCK_AUTHOR = "User";

// Helper: Mock thread with recentMessages
function mockThread(userText: string): Thread<Record<string, unknown>, unknown> {
  return {
    recentMessages: [
      {
        author: MOCK_AUTHOR,
        text: userText,
      },
    ],
  } as unknown as Thread<Record<string, unknown>, unknown>;
}

// Helper: Stream with create_issue and issueId
async function* streamWithIssueId(): AsyncGenerator<unknown> {
  yield {
    type: "assistant",
    message: {
      content: [
        {
          type: "text",
          text: `{"action":"create_issue","title":"Test bug","description":"test","difficulty":"${MOCK_DIFFICULTY}","issueId":"${MOCK_ISSUE_ID}"}`,
        },
      ],
    },
  };
  yield { type: "result", subtype: "success", usage: { total_tokens: 100 } };
}

// Helper: Stream with create_issue but no issueId
async function* streamWithoutIssueId(): AsyncGenerator<unknown> {
  yield {
    type: "assistant",
    message: {
      content: [
        {
          type: "text",
          text: `{"action":"create_issue","title":"Test","description":"test"}`,
        },
      ],
    },
  };
  yield { type: "result", subtype: "success" };
}

// Helper: Stream with answered_question
async function* streamAnsweredQuestion(): AsyncGenerator<unknown> {
  yield {
    type: "assistant",
    message: {
      content: [
        {
          type: "text",
          text: `{"action":"answered_question","message":"Here is the answer"}`,
        },
      ],
    },
  };
  yield { type: "result", subtype: "success" };
}

// Helper: Stream with asked_clarifying_question
async function* streamAskedQuestion(): AsyncGenerator<unknown> {
  yield {
    type: "assistant",
    message: {
      content: [
        {
          type: "text",
          text: `{"action":"asked_clarifying_question","message":"Can you provide steps to reproduce?"}`,
        },
      ],
    },
  };
  yield { type: "result", subtype: "success" };
}

// Helper: Stream with no result message
async function* streamNoResult(): AsyncGenerator<unknown> {
  yield {
    type: "assistant",
    message: {
      content: [{ type: "text", text: `{"action":"create_issue"}` }],
    },
  };
}

// Helper: Stream with max turns exceeded
async function* streamMaxTurns(): AsyncGenerator<unknown> {
  yield { type: "result", subtype: "error_max_turns" };
}

// Helper: Stream with invalid JSON
async function* streamInvalidJson(): AsyncGenerator<unknown> {
  yield {
    type: "assistant",
    message: {
      content: [{ type: "text", text: "Not valid JSON" }],
    },
  };
  yield { type: "result", subtype: "success" };
}

// Helper: Stream with unknown action
async function* streamUnknownAction(): AsyncGenerator<unknown> {
  yield {
    type: "assistant",
    message: {
      content: [{ type: "text", text: `{"action":"unknown_action"}` }],
    },
  };
  yield { type: "result", subtype: "success" };
}

// eslint-disable-next-line max-lines-per-function
describe("TriageAgent", () => {
  let agent: TriageAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new TriageAgent();
    vi.mocked(langfuse.fetchTriageAgentPrompt).mockResolvedValue("system prompt");
  });

  describe("TS5 - issueId captured from JSON", () => {
    it("captures issueId from create_issue action", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamWithIssueId as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread(MOCK_USER_TEXT));
      expect(outcome.action).toBe("created_issue");
      expect(outcome.issueId).toBe(MOCK_ISSUE_ID);
      expect(outcome.issueUrl).toBe(MOCK_ISSUE_URL);
      expect(outcome.difficulty).toBe(MOCK_DIFFICULTY);
    });
  });

  describe("TS6 - Missing issueId", () => {
    it("handles missing issueId gracefully", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamWithoutIssueId as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread(MOCK_USER_TEXT));
      expect(outcome.action).toBe("created_issue");
      expect(outcome.issueId).toBeUndefined();
      expect(outcome.issueUrl).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("create_issue action produced no issueId"),
      );
    });

    it("returns created_issue outcome without issueId", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamWithoutIssueId as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread(MOCK_USER_TEXT));
      expect(outcome.action).toBe("created_issue");
      expect(outcome.message).toBeDefined();
    });
  });

  describe("answered_question action", () => {
    it("returns answered_question outcome", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamAnsweredQuestion as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread("How do I use this?"));
      expect(outcome.action).toBe("answered_question");
      expect(outcome.message).toBe("Here is the answer");
      expect(outcome.issueId).toBeUndefined();
    });
  });

  describe("asked_clarifying_question action", () => {
    it("returns asked_clarifying_question outcome", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamAskedQuestion as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread("Something is broken"));
      expect(outcome.action).toBe("asked_clarifying_question");
      expect(outcome.message).toBe("Can you provide steps to reproduce?");
      expect(outcome.issueId).toBeUndefined();
    });
  });

  // eslint-disable-next-line max-lines-per-function
  describe("Error handling", () => {
    it("handles no result message", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamNoResult as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread(MOCK_USER_TEXT));
      expect(outcome.action).toBe("error");
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("No result message received"),
      );
    });

    it("handles max rounds exceeded", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamMaxTurns as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread(MOCK_USER_TEXT));
      expect(outcome.action).toBe("error");
      expect(outcome.maxRoundsReached).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Max clarification rounds reached"),
      );
    });

    it("handles invalid JSON response", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamInvalidJson as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread(MOCK_USER_TEXT));
      expect(outcome.action).toBe("error");
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("No JSON found"));
    });

    it("handles unknown action", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      vi.mocked(query).mockImplementation(streamUnknownAction as unknown as typeof QueryType);
      const outcome = await agent.run(mockThread(MOCK_USER_TEXT));
      expect(outcome.action).toBe("error");
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Unknown action"));
    });
  });
});
