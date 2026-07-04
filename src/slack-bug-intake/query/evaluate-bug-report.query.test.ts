import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import { makeTestMessage } from "@/test/message-helper";

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));

vi.mock("@/slack-bug-intake/agent/bug-triage.agent", async () => {
  const { z } = await import("zod");
  return {
    bugTriageAgent: { generate: generateMock },
    EvaluationSchema: z.object({
      isComplete: z.boolean(),
      clarifyingQuestion: z.string().nullable(),
    }),
  };
});

describe("EvaluateBugReportQuery", () => {
  let query: EvaluateBugReportQuery;

  beforeEach(() => {
    query = new EvaluateBugReportQuery();
    vi.clearAllMocks();
  });

  describe("report completion", () => {
    it("returns isComplete true and null question when report is complete", async () => {
      generateMock.mockResolvedValue({ object: { isComplete: true, clarifyingQuestion: null } });

      const messages = [makeTestMessage("Here is my complete bug report with all details.", false)];
      const result = await query.execute(messages);

      expect(result.isComplete).toBe(true);
      expect(result.clarifyingQuestion).toBeNull();
    });

    it("returns isComplete false with question when steps to reproduce are missing", async () => {
      generateMock.mockResolvedValue({
        object: {
          isComplete: false,
          clarifyingQuestion: "Could you provide the steps to reproduce this issue?",
        },
      });

      const messages = [makeTestMessage("The button is broken.", false)];
      const result = await query.execute(messages);

      expect(result.isComplete).toBe(false);
      expect(result.clarifyingQuestion).toBe(
        "Could you provide the steps to reproduce this issue?",
      );
    });
  });

  describe("message role mapping", () => {
    it("maps bot messages to role assistant and user messages to role user", async () => {
      generateMock.mockResolvedValue({
        object: { isComplete: false, clarifyingQuestion: "What environment?" },
      });

      const messages = [
        makeTestMessage("The button is broken.", false),
        makeTestMessage("Can you describe the expected behaviour?", true),
        makeTestMessage("I expected it to submit the form.", false),
      ];

      await query.execute(messages);

      const callArgs = generateMock.mock.calls[0][0] as unknown[];
      expect(callArgs).toEqual([
        { role: "user", content: "The button is broken." },
        { role: "assistant", content: "Can you describe the expected behaviour?" },
        { role: "user", content: "I expected it to submit the form." },
      ]);
    });
  });

  describe("agent configuration", () => {
    it("passes the structured output schema to the agent", async () => {
      generateMock.mockResolvedValue({
        object: { isComplete: true, clarifyingQuestion: null },
      });

      await query.execute([makeTestMessage("report", false)]);

      expect(generateMock).toHaveBeenCalledOnce();
      const options = generateMock.mock.calls[0][1] as { structuredOutput: { schema: unknown } };
      expect(options.structuredOutput.schema).toBeDefined();
    });
  });
});
