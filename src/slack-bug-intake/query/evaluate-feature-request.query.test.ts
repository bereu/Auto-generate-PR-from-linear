import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvaluateFeatureRequestQuery } from "@/slack-bug-intake/query/evaluate-feature-request.query";
import { makeTestMessage } from "@/test/message-helper";

const FIRST_CALL = 0;
const FIRST_ARG = 0;
const SECOND_ARG = 1;
const THREAD_MESSAGE_COUNT = 3;

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));

vi.mock("@/slack-bug-intake/agent/feature-intake.agent", async () => {
  const { z } = await import("zod");
  return {
    featureIntakeAgent: { generate: generateMock },
    FeatureEvaluationSchema: z.object({
      isComplete: z.boolean(),
      clarifyingQuestion: z.string().nullable(),
    }),
  };
});

describe("EvaluateFeatureRequestQuery - complete requests", () => {
  let query: EvaluateFeatureRequestQuery;

  beforeEach(() => {
    query = new EvaluateFeatureRequestQuery();
    vi.clearAllMocks();
  });

  it("returns isComplete true and null question when feature request is complete", async () => {
    generateMock.mockResolvedValue({ object: { isComplete: true, clarifyingQuestion: null } });

    const messages = [
      makeTestMessage(
        "I'd like to add dark mode. It would make the app easier to use at night. Users could toggle it in settings.",
        false,
      ),
    ];
    const result = await query.execute(messages);

    expect(result.isComplete).toBe(true);
    expect(result.clarifyingQuestion).toBeNull();
  });
});

describe("EvaluateFeatureRequestQuery - missing use case", () => {
  let query: EvaluateFeatureRequestQuery;

  beforeEach(() => {
    query = new EvaluateFeatureRequestQuery();
    vi.clearAllMocks();
  });

  it("returns isComplete false with question when use case is missing", async () => {
    generateMock.mockResolvedValue({
      object: {
        isComplete: false,
        clarifyingQuestion: "What specific use case would this feature solve for you?",
      },
    });

    const messages = [makeTestMessage("Can you add support for exporting to PDF?", false)];
    const result = await query.execute(messages);

    expect(result.isComplete).toBe(false);
    expect(result.clarifyingQuestion).toBe(
      "What specific use case would this feature solve for you?",
    );
  });
});

describe("EvaluateFeatureRequestQuery - missing problem statement", () => {
  let query: EvaluateFeatureRequestQuery;

  beforeEach(() => {
    query = new EvaluateFeatureRequestQuery();
    vi.clearAllMocks();
  });

  it("returns isComplete false with question when problem statement is missing", async () => {
    generateMock.mockResolvedValue({
      object: {
        isComplete: false,
        clarifyingQuestion:
          "What problem does this feature solve? Why would users benefit from it?",
      },
    });

    const messages = [makeTestMessage("Please add keyboard shortcuts.", false)];
    const result = await query.execute(messages);

    expect(result.isComplete).toBe(false);
    expect(result.clarifyingQuestion).toBe(
      "What problem does this feature solve? Why would users benefit from it?",
    );
  });
});

describe("EvaluateFeatureRequestQuery - message role mapping", () => {
  let query: EvaluateFeatureRequestQuery;

  beforeEach(() => {
    query = new EvaluateFeatureRequestQuery();
    vi.clearAllMocks();
  });

  it("maps bot messages to role assistant and user messages to role user", async () => {
    generateMock.mockResolvedValue({
      object: { isComplete: false, clarifyingQuestion: "Tell me more?" },
    });

    const messages = [
      makeTestMessage("Add notifications feature.", false),
      makeTestMessage("Can you describe the use case?", true),
      makeTestMessage("Users want to be alerted about new messages.", false),
    ];

    await query.execute(messages);

    const callArgs = generateMock.mock.calls[FIRST_CALL][FIRST_ARG] as unknown[];
    expect(callArgs).toEqual([
      { role: "user", content: "Add notifications feature." },
      { role: "assistant", content: "Can you describe the use case?" },
      { role: "user", content: "Users want to be alerted about new messages." },
    ]);
  });
});

describe("EvaluateFeatureRequestQuery - agent schema", () => {
  let query: EvaluateFeatureRequestQuery;

  beforeEach(() => {
    query = new EvaluateFeatureRequestQuery();
    vi.clearAllMocks();
  });

  it("passes the structured output schema to the agent", async () => {
    generateMock.mockResolvedValue({
      object: { isComplete: true, clarifyingQuestion: null },
    });

    await query.execute([makeTestMessage("Add feature X", false)]);

    expect(generateMock).toHaveBeenCalledOnce();
    const options = generateMock.mock.calls[FIRST_CALL][SECOND_ARG] as {
      structuredOutput: { schema: unknown };
    };
    expect(options.structuredOutput.schema).toBeDefined();
  });
});

describe("EvaluateFeatureRequestQuery - conversation context", () => {
  let query: EvaluateFeatureRequestQuery;

  beforeEach(() => {
    query = new EvaluateFeatureRequestQuery();
    vi.clearAllMocks();
  });

  it("evaluates completeness across entire conversation", async () => {
    generateMock.mockResolvedValue({
      object: { isComplete: true, clarifyingQuestion: null },
    });

    const messages = [
      makeTestMessage("Add bulk export capability", false),
      makeTestMessage("I need this for my workflow", false),
      makeTestMessage("Users would save 2 hours per week", false),
    ];

    await query.execute(messages);

    const callArgs = generateMock.mock.calls[FIRST_CALL][FIRST_ARG] as unknown[];
    expect(callArgs).toHaveLength(THREAD_MESSAGE_COUNT);
  });
});
