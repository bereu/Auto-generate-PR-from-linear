import { z } from "zod";
import type { ModelMessage } from "ai";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import type { PublicSchema } from "@mastra/core/schema";
import type { Thread } from "chat";
import type { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import type { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import {
  MAX_CLARIFICATION_ROUNDS,
  FALLBACK_DIFFICULTY,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { WORKFLOW_NAMES, WORKFLOW_STEP_IDS } from "@/constants/mastra.constants";
import { logger } from "@/util/logger";
import {
  complexityAgent,
  DifficultySchema,
  type Difficulty,
} from "@/slack-bug-intake/agent/complexity.agent";

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
 * Schema for the complexity result produced by assessComplexityStep.
 * Includes the difficulty assessment from the complexity agent.
 */
const ComplexityResultSchema = z.object({
  difficulty: DifficultySchema,
});

type ComplexityResult = z.infer<typeof ComplexityResultSchema>;

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
 * Step 2: Assess the complexity of the bug report.
 * Uses the complexity agent with workspace access to domain docs.
 * Executed after evaluation confirms the report is complete, before creating the issue.
 * Returns a difficulty rating (easy | medium | hard) that will be added as a label.
 * On LLM failure, logs the error and returns FALLBACK_DIFFICULTY so issue creation
 * can proceed — assessment is an enhancement, not a blocker (BE-003).
 */
const assessComplexityStep = createStep({
  id: WORKFLOW_STEP_IDS.assessComplexity,
  description: "Assess issue complexity and determine difficulty label",
  inputSchema: EvaluationResultSchema,
  outputSchema: ComplexityResultSchema,
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");

    try {
      const messages = thread.recentMessages.map((m) => ({
        role: m.author.isMe ? "assistant" : "user",
        content: m.text,
      })) as ModelMessage[];

      // Use the complexity agent with workspace access for domain-aware assessment.
      // The agent automatically has list/read/search tools scoped to docs/domain.
      const { object } = await complexityAgent.generate(messages, {
        structuredOutput: {
          schema: z.object({ difficulty: DifficultySchema }) as unknown as PublicSchema<{
            difficulty: Difficulty;
          }>,
        },
      });

      logger.info(`[slack-triage] complexity assessed: difficulty=${object.difficulty}`);
      return { difficulty: object.difficulty };
    } catch (error) {
      // BE-003: Log failure and degrade gracefully to safe default.
      logger.warn(`[slack-triage] complexity assessment failed: ${(error as Error).message}`, {
        error: error as Error,
      });
      return { difficulty: FALLBACK_DIFFICULTY };
    }
  },
});

/**
 * Step 3: Create a Linear issue and post the URL to Slack.
 * Executed when the report is complete (after complexity assessment).
 * Receives the complexity result from assessComplexityStep and passes difficulty to the command.
 * Unsubscribes from the thread after posting.
 */
const createIssueStep = createStep({
  id: WORKFLOW_STEP_IDS.createIssue,
  description: "Create Linear issue from complete bug report",
  inputSchema: ComplexityResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const createLinearIssue = requestContext.get<"createLinearIssue", CreateLinearIssueCommand>(
      "createLinearIssue",
    );
    const { url } = await createLinearIssue.execute(thread.recentMessages, inputData.difficulty);
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
 * Step 4: Escalate an unrecoverable triage as a workflow error.
 * Executed when rounds are exhausted or no clarifying question can be formed.
 *
 * Follows Mastra's official error-handling pattern — throwing inside `execute`
 * exits the workflow with a `failed` status
 * (https://mastra.ai/docs/workflows/error-handling). The thread is unsubscribed
 * first so the clarify loop stops, then the error is thrown; the coordinator
 * inspects `result.status === "failed"`, reports it via the logger util (BE-003),
 * and notifies the reporter in-thread.
 */
const escalateStep = createStep({
  id: WORKFLOW_STEP_IDS.escalate,
  description: "Escalate unrecoverable triage as a workflow error",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    // Local breadcrumb only (info → not forwarded to Rollbar). The single error
    // report happens once at the coordinator when the run resolves failed (BE-003).
    logger.info(`[slack-triage] rounds exhausted or no question — escalating as workflow error`);
    await thread.unsubscribe();
    throw new Error(
      "Bug triage could not gather sufficient details after maximum clarification rounds",
    );
  },
});

/**
 * Fallback condition: neither complete nor (incomplete + question + rounds remaining).
 * Ensures exactly ONE branch runs per turn (disjoint partition with completion and ask conditions).
 */
const fallbackCondition = async (params: { inputData: EvaluationResult }): Promise<boolean> => {
  const complete = await isCompletionCondition(params);
  const askable = await hasQuestionAndRoundsCondition(params);
  return !complete && !askable;
};

/**
 * Nested completion workflow: chains assess complexity → create issue.
 * Maintains the disjoint partition property of the branch:
 * the completion condition selects this entire nested workflow as its target,
 * so only ONE of the three main branches runs per turn.
 */
const completionWorkflow = createWorkflow({
  id: `${WORKFLOW_NAMES.bugTriage}-completion`,
  description: "Assess complexity and create Linear issue",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
})
  .then(assessComplexityStep)
  .then(createIssueStep)
  .commit();

/**
 * Bug Triage Workflow
 *
 * Orchestrates the Slack bug report clarification loop:
 * 1. Evaluate the report for completeness
 * 2. Branch on evaluation result:
 *    - If complete: assess complexity → create Linear issue, post URL, unsubscribe
 *    - Else if rounds remaining + question exists: post question, continue
 *    - Else (no question or max rounds): unsubscribe and throw — the run
 *      resolves with a `failed` status for the coordinator to handle
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
    [isCompletionCondition, completionWorkflow],
    [hasQuestionAndRoundsCondition, askStep],
    [fallbackCondition, escalateStep],
  ])
  .commit();

// Export steps, schemas, and conditions for testing
export {
  evaluateStep,
  assessComplexityStep,
  createIssueStep,
  askStep,
  escalateStep,
  isCompletionCondition,
  hasQuestionAndRoundsCondition,
  fallbackCondition,
  EvaluationResultSchema,
  ComplexityResultSchema,
  type EvaluationResult,
  type ComplexityResult,
};
