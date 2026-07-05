import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import type { Thread } from "chat";
import type { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import type { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import {
  MAX_CLARIFICATION_ROUNDS,
  FALLBACK_MESSAGE,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { WORKFLOW_NAMES, WORKFLOW_STEP_IDS } from "@/constants/mastra.constants";
import { logger } from "@/util/logger";

/**
 * Schema for the evaluation result produced by evaluateStep.
 * Matches the output of EvaluateBugReportQuery.execute.
 */
const EvaluationResultSchema = z.object({
  isComplete: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
  botTurns: z.number(),
});

type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

/**
 * Step 1: Evaluate the bug report using the triage agent.
 * Calls EvaluateBugReportQuery to assess completeness.
 * Logs evaluation details with [slack-triage] prefix.
 */
const evaluateStep = createStep({
  id: WORKFLOW_STEP_IDS.evaluate,
  description: "Evaluate bug report completeness",
  inputSchema: z.object({}),
  outputSchema: EvaluationResultSchema,
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const evaluateBugReport = requestContext.get<"evaluateBugReport", EvaluateBugReportQuery>(
      "evaluateBugReport",
    );
    const { isComplete, clarifyingQuestion } = await evaluateBugReport.execute(
      thread.recentMessages,
    );
    const botTurns = thread.recentMessages.filter((m) => m.author.isMe).length;
    logger.info(
      `[slack-triage] evaluated: isComplete=${isComplete} hasQuestion=${clarifyingQuestion !== null} botTurns=${botTurns} messages=${thread.recentMessages.length}`,
    );
    return { isComplete, clarifyingQuestion, botTurns };
  },
});

/**
 * Step 2: Create a Linear issue and post the URL to Slack.
 * Executed when the report is complete.
 * Unsubscribes from the thread after posting.
 */
const createIssueStep = createStep({
  id: WORKFLOW_STEP_IDS.createIssue,
  description: "Create Linear issue from complete bug report",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const createLinearIssue = requestContext.get<"createLinearIssue", CreateLinearIssueCommand>(
      "createLinearIssue",
    );
    const { url } = await createLinearIssue.execute(thread.recentMessages);
    logger.info(`[slack-triage] Linear issue created: ${url}`);
    await thread.post(`Linear issue created: ${url}`);
    await thread.unsubscribe();
    return {};
  },
});

/**
 * Condition: Report is complete.
 */
const isCompletionCondition = async (params: { inputData: EvaluationResult }): Promise<boolean> => {
  return params.inputData.isComplete;
};

/**
 * Step 3: Post a clarifying question to the Slack thread.
 * Executed when the report is incomplete, there are remaining rounds, and a question exists.
 * Does not unsubscribe.
 */
const askStep = createStep({
  id: WORKFLOW_STEP_IDS.ask,
  description: "Post clarifying question",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    logger.info(`[slack-triage] posting clarifying question`);
    await thread.post(inputData.clarifyingQuestion!);
    return {};
  },
});

/**
 * Condition: Report incomplete, rounds remaining, and question exists.
 */
const hasQuestionAndRoundsCondition = async (params: {
  inputData: EvaluationResult;
}): Promise<boolean> => {
  const { isComplete, clarifyingQuestion, botTurns } = params.inputData;
  return !isComplete && botTurns < MAX_CLARIFICATION_ROUNDS && clarifyingQuestion !== null;
};

/**
 * Step 4: Post fallback message and unsubscribe.
 * Executed when rounds are exhausted or no clarifying question can be formed.
 */
const fallbackStep = createStep({
  id: WORKFLOW_STEP_IDS.fallback,
  description: "Post fallback message and unsubscribe",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    logger.info(
      `[slack-triage] rounds exhausted or no question — posting fallback and unsubscribing`,
    );
    await thread.post(FALLBACK_MESSAGE);
    await thread.unsubscribe();
    return {};
  },
});

/**
 * Always-true condition (fallback case, executed when other branches don't match).
 */
const alwaysTrueCondition = async (): Promise<boolean> => true;

/**
 * Bug Triage Workflow
 *
 * Orchestrates the Slack bug report clarification loop:
 * 1. Evaluate the report for completeness
 * 2. Branch on evaluation result:
 *    - If complete: create Linear issue, post URL, unsubscribe
 *    - Else if rounds remaining + question exists: post question, continue
 *    - Else (no question or max rounds): post fallback, unsubscribe
 *
 * All dependencies (thread, queries, commands) are injected via runtimeContext.
 * This workflow is stateless per-run; conversation history is managed by the Chat SDK.
 */
export const bugTriageWorkflow = createWorkflow({
  id: WORKFLOW_NAMES.bugTriage,
  description: "Evaluate Slack bug report, ask clarifying questions, or create Linear issue",
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(evaluateStep)
  .branch([
    [isCompletionCondition, createIssueStep],
    [hasQuestionAndRoundsCondition, askStep],
    [alwaysTrueCondition, fallbackStep],
  ])
  .commit();

// Export steps for testing
export { evaluateStep, createIssueStep, askStep, fallbackStep };
