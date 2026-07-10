import { describe, it, expect, vi, beforeEach } from "vitest";
import { EvaluateBugReportQuery } from "@/slack-triage/query/evaluate-bug-report.query";
import { makeTestMessage } from "@/test/message-helper";
import type { LocalFilesystem } from "@mastra/core/workspace";
import path from "path";
import { DOMAIN_DOCS_DIR } from "@/slack-triage/slack-triage.constants";

const FIRST_CALL = 0;
const FIRST_ARG = 0;
const SECOND_ARG = 1;

const { generateMock } = vi.hoisted(() => ({ generateMock: vi.fn() }));

vi.mock("@/slack-triage/agent/bug-triage.agent", async () => {
  const { z } = await import("zod");
  return {
    bugTriageAgent: { generate: generateMock },
    EvaluationSchema: z.object({
      isComplete: z.boolean(),
      clarifyingQuestion: z.string().nullable(),
    }),
  };
});

describe("EvaluateBugReportQuery - report completion", () => {
  let query: EvaluateBugReportQuery;

  beforeEach(() => {
    query = new EvaluateBugReportQuery();
    vi.clearAllMocks();
  });

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
    expect(result.clarifyingQuestion).toBe("Could you provide the steps to reproduce this issue?");
  });
});

describe("EvaluateBugReportQuery - message role mapping", () => {
  let query: EvaluateBugReportQuery;

  beforeEach(() => {
    query = new EvaluateBugReportQuery();
    vi.clearAllMocks();
  });

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

    const callArgs = generateMock.mock.calls[FIRST_CALL][FIRST_ARG] as unknown[];
    expect(callArgs).toEqual([
      { role: "user", content: "The button is broken." },
      { role: "assistant", content: "Can you describe the expected behaviour?" },
      { role: "user", content: "I expected it to submit the form." },
    ]);
  });
});

describe("EvaluateBugReportQuery - agent configuration", () => {
  let query: EvaluateBugReportQuery;

  beforeEach(() => {
    query = new EvaluateBugReportQuery();
    vi.clearAllMocks();
  });

  it("passes the structured output schema to the agent", async () => {
    generateMock.mockResolvedValue({
      object: { isComplete: true, clarifyingQuestion: null },
    });

    await query.execute([makeTestMessage("report", false)]);

    expect(generateMock).toHaveBeenCalledOnce();
    const options = generateMock.mock.calls[FIRST_CALL][SECOND_ARG] as {
      structuredOutput: { schema: unknown };
    };
    expect(options.structuredOutput.schema).toBeDefined();
  });
});

describe("EvaluateBugReportQuery - workspace integration", () => {
  it("should have domain docs workspace configured for read-only file access", async () => {
    // Import and verify the workspace is properly configured.
    // This test verifies that the agent has access to domain docs via the workspace.
    const { domainDocsWorkspace } = await import("@/slack-triage/agent/domain-docs.workspace");

    expect(domainDocsWorkspace).toBeDefined();
    expect(domainDocsWorkspace.filesystem).toBeDefined();
  });

  it("should have workspace with basePath pointing to DOMAIN_DOCS_DIR", async () => {
    const { domainDocsWorkspace } = await import("@/slack-triage/agent/domain-docs.workspace");

    const expectedBasePath = path.resolve(DOMAIN_DOCS_DIR);
    const filesystem = domainDocsWorkspace.filesystem as LocalFilesystem;

    expect(filesystem.basePath).toBe(expectedBasePath);
  });

  it("should have read-only enabled on workspace filesystem", async () => {
    const { domainDocsWorkspace } = await import("@/slack-triage/agent/domain-docs.workspace");

    const filesystem = domainDocsWorkspace.filesystem as LocalFilesystem;
    expect(filesystem.readOnly).toBe(true);
  });
});
