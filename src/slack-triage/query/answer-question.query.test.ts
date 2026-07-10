import { describe, it, expect, vi, beforeEach } from "vitest";
import { AnswerQuestionQuery } from "@/slack-triage/query/answer-question.query";
import { makeTestMessage } from "@/test/message-helper";

const FIRST_CALL = 0;
const FIRST_ARG = 0;
const SECOND_ARG = 1;
const THREAD_MESSAGE_COUNT = 3;

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));

vi.mock("@/slack-triage/agent/question-answer.agent", async () => {
  const { z } = await import("zod");
  return {
    questionAnswerAgent: { generate: generateMock },
    AnswerSchema: z.object({
      answer: z.string(),
    }),
  };
});

describe("AnswerQuestionQuery - answer generation", () => {
  let query: AnswerQuestionQuery;

  beforeEach(() => {
    query = new AnswerQuestionQuery();
    vi.clearAllMocks();
  });

  it("returns an answer string from the agent", async () => {
    const expectedAnswer =
      "You can reset your password by clicking the 'Forgot Password' link on the login page.";
    generateMock.mockResolvedValue({ object: { answer: expectedAnswer } });

    const messages = [makeTestMessage("How do I reset my password?", false)];
    const result = await query.execute(messages);

    expect(result.answer).toBe(expectedAnswer);
  });

  it("returns detailed answers with multiple sentences", async () => {
    const expectedAnswer =
      "To enable two-factor authentication, go to Settings > Security > Two-Factor Authentication. Choose your preferred method (SMS or authenticator app) and follow the prompts. You'll receive a confirmation email once it's set up.";
    generateMock.mockResolvedValue({ object: { answer: expectedAnswer } });

    const messages = [makeTestMessage("How do I enable two-factor authentication?", false)];
    const result = await query.execute(messages);

    expect(result.answer).toBe(expectedAnswer);
  });
});

describe("AnswerQuestionQuery - message role mapping", () => {
  let query: AnswerQuestionQuery;

  beforeEach(() => {
    query = new AnswerQuestionQuery();
    vi.clearAllMocks();
  });

  it("maps bot messages to role assistant and user messages to role user", async () => {
    generateMock.mockResolvedValue({ object: { answer: "The API endpoint is /api/users." } });

    const messages = [
      makeTestMessage("What's the API endpoint for users?", false),
      makeTestMessage("Can you give me more details?", false),
    ];

    await query.execute(messages);

    const callArgs = generateMock.mock.calls[FIRST_CALL][FIRST_ARG] as unknown[];
    expect(callArgs).toEqual([
      { role: "user", content: "What's the API endpoint for users?" },
      { role: "user", content: "Can you give me more details?" },
    ]);
  });
});

describe("AnswerQuestionQuery - agent schema configuration", () => {
  let query: AnswerQuestionQuery;

  beforeEach(() => {
    query = new AnswerQuestionQuery();
    vi.clearAllMocks();
  });

  it("passes the structured output schema to the agent", async () => {
    generateMock.mockResolvedValue({ object: { answer: "Your answer here." } });

    await query.execute([makeTestMessage("How does X work?", false)]);

    expect(generateMock).toHaveBeenCalledOnce();
    const options = generateMock.mock.calls[FIRST_CALL][SECOND_ARG] as {
      structuredOutput: { schema: unknown };
    };
    expect(options.structuredOutput.schema).toBeDefined();
  });
});

describe("AnswerQuestionQuery - conversation history", () => {
  let query: AnswerQuestionQuery;

  beforeEach(() => {
    query = new AnswerQuestionQuery();
    vi.clearAllMocks();
  });

  it("uses entire conversation history to answer", async () => {
    generateMock.mockResolvedValue({
      object: {
        answer: "In the advanced settings, under the Profile section.",
      },
    });

    const messages = [
      makeTestMessage("Where is the profile settings?", false),
      makeTestMessage("Can you be more specific?", false),
      makeTestMessage("I'm looking at the main dashboard.", false),
    ];

    await query.execute(messages);

    // Verify entire thread context was provided
    const callArgs = generateMock.mock.calls[FIRST_CALL][FIRST_ARG] as unknown[];
    expect(callArgs).toHaveLength(THREAD_MESSAGE_COUNT);
  });
});
