import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClassifyMessageQuery } from "@/slack-bug-intake/query/classify-message.query";
import { makeTestMessage } from "@/test/message-helper";

const FIRST_CALL = 0;
const FIRST_ARG = 0;
const SECOND_ARG = 1;
const THREAD_MESSAGE_COUNT = 3;

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));

vi.mock("@/slack-bug-intake/agent/intent-classifier.agent", async () => {
  const { z } = await import("zod");
  return {
    intentClassifierAgent: { generate: generateMock },
    IntentSchema: z.object({
      intent: z.enum(["question", "bug", "feature_request"]),
    }),
  };
});

describe("ClassifyMessageQuery - intent classification", () => {
  let query: ClassifyMessageQuery;

  beforeEach(() => {
    query = new ClassifyMessageQuery();
    vi.clearAllMocks();
  });

  it("returns question intent when user asks a question", async () => {
    generateMock.mockResolvedValue({ object: { intent: "question" } });

    const messages = [makeTestMessage("How does the authentication work?", false)];
    const result = await query.execute(messages);

    expect(result.intent).toBe("question");
  });

  it("returns bug intent when user reports a bug", async () => {
    generateMock.mockResolvedValue({ object: { intent: "bug" } });

    const messages = [makeTestMessage("The login button is broken and never submits.", false)];
    const result = await query.execute(messages);

    expect(result.intent).toBe("bug");
  });

  it("returns feature_request intent when user requests a feature", async () => {
    generateMock.mockResolvedValue({ object: { intent: "feature_request" } });

    const messages = [makeTestMessage("Can you add dark mode to the app?", false)];
    const result = await query.execute(messages);

    expect(result.intent).toBe("feature_request");
  });
});

describe("ClassifyMessageQuery - message role mapping", () => {
  let query: ClassifyMessageQuery;

  beforeEach(() => {
    query = new ClassifyMessageQuery();
    vi.clearAllMocks();
  });

  it("maps bot messages to role assistant and user messages to role user", async () => {
    generateMock.mockResolvedValue({ object: { intent: "question" } });

    const messages = [
      makeTestMessage("How do I reset my password?", false),
      makeTestMessage("You can click the forgot password link on the login page.", true),
      makeTestMessage("But I don't see that link.", false),
    ];

    await query.execute(messages);

    const callArgs = generateMock.mock.calls[FIRST_CALL][FIRST_ARG] as unknown[];
    expect(callArgs).toEqual([
      { role: "user", content: "How do I reset my password?" },
      { role: "assistant", content: "You can click the forgot password link on the login page." },
      { role: "user", content: "But I don't see that link." },
    ]);
  });
});

describe("ClassifyMessageQuery - agent configuration", () => {
  let query: ClassifyMessageQuery;

  beforeEach(() => {
    query = new ClassifyMessageQuery();
    vi.clearAllMocks();
  });

  it("passes the structured output schema to the agent", async () => {
    generateMock.mockResolvedValue({ object: { intent: "bug" } });

    await query.execute([makeTestMessage("Button broken", false)]);

    expect(generateMock).toHaveBeenCalledOnce();
    const options = generateMock.mock.calls[FIRST_CALL][SECOND_ARG] as {
      structuredOutput: { schema: unknown };
    };
    expect(options.structuredOutput.schema).toBeDefined();
  });

  it("classifies based on entire thread context", async () => {
    generateMock.mockResolvedValue({ object: { intent: "bug" } });

    const messages = [
      makeTestMessage("How do I login?", false),
      makeTestMessage("Click the login button.", true),
      makeTestMessage("OK I tried but it keeps showing an error message.", false),
    ];

    const result = await query.execute(messages);

    expect(result.intent).toBe("bug");
    // Verify the entire thread was sent to the agent
    const callArgs = generateMock.mock.calls[FIRST_CALL][FIRST_ARG] as unknown[];
    expect(callArgs).toHaveLength(THREAD_MESSAGE_COUNT);
  });
});
