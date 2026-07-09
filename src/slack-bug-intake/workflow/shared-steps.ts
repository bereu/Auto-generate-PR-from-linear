import { z } from "zod";
import type { ModelMessage } from "ai";
import { createStep } from "@mastra/core/workflows";
import type { PublicSchema } from "@mastra/core/schema";
import type { Thread } from "chat";
import type { EvaluateBugReportQuery } from "@/slack-bug-intake/query/evaluate-bug-report.query";
import type { EvaluateFeatureRequestQuery } from "@/slack-bug-intake/query/evaluate-feature-request.query";
import type { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import {
  MAX_CLARIFICATION_ROUNDS,
  FALLBACK_DIFFICULTY,
  INTENT_KINDS,
  buildMaxRoundsIssueCreatedMessage,
  buildIssueCreatedMessage,
  type IntentKind,
} from "@/slack-bug-intake/slack-bug-intake.constants";
import { WORKFLOW_STEP_IDS } from "@/constants/mastra.constants";
import { InsufficientBugDetailError } from "@/constants/errors/business.error";
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
export const EvaluationResultSchema = z.object({
  isComplete: z.boolean(),
  clarifyingQuestion: z.string().nullable(),
  botTurns: z.number(),
});

export type EvaluationResult = z.infer<typeof EvaluationResultSchema>;

/**
 * Schema for the complexity result produced by assessComplexityStep.
 * Includes the difficulty assessment from the complexity agent.
 */
export const ComplexityResultSchema = z.object({
  difficulty: DifficultySchema,
});

export type ComplexityResult = z.infer<typeof ComplexityResultSchema>;

/**
 * Step 1: Evaluate the bug report using the triage agent.
 * Calls EvaluateBugReportQuery to assess completeness.
 */
export const evaluateStep = createStep({
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
 * Step 1 (Feature): Evaluate the feature request using the feature-intake agent.
 * Calls EvaluateFeatureRequestQuery to assess completeness.
 */
export const evaluateFeatureStep = createStep({
  id: `${WORKFLOW_STEP_IDS.evaluate}-feature`,
  description: "Evaluate feature request completeness",
  inputSchema: z.object({}),
  outputSchema: EvaluationResultSchema,
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const evaluateFeatureRequest = requestContext.get<
      "evaluateFeatureRequest",
      EvaluateFeatureRequestQuery
    >("evaluateFeatureRequest");
    const { isComplete, clarifyingQuestion } = await evaluateFeatureRequest.execute(
      thread.recentMessages,
    );
    const botTurns = thread.recentMessages.filter((m) => m.author.isMe).length;
    logger.info(
      `[slack-triage] feature intake: isComplete=${isComplete} hasQuestion=${clarifyingQuestion !== null} botTurns=${botTurns} messages=${thread.recentMessages.length}`,
    );
    return { isComplete, clarifyingQuestion, botTurns };
  },
});

/**
 * Step 2: Assess the complexity of the bug report.
 */
export const assessComplexityStep = createStep({
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
      logger.warn(`[slack-triage] complexity assessment failed: ${(error as Error).message}`, {
        error: error as Error,
      });
      return { difficulty: FALLBACK_DIFFICULTY };
    }
  },
});

/**
 * Helper function to create a Linear issue and post a custom closing message.
 */
export const createIssueWithMessage = async (
  thread: Thread,
  createLinearIssue: CreateLinearIssueCommand,
  difficulty: Difficulty,
  buildMessage: (url: string) => string,
  kind?: IntentKind,
): Promise<void> => {
  const { url } = await createLinearIssue.execute(thread.recentMessages, difficulty, kind);
  logger.info(`[slack-triage] Linear issue created: ${url}`);
  const message = buildMessage(url);
  await thread.post(message);
  await thread.unsubscribe();
};

/**
 * Step 3: Create a Linear bug issue and post the URL to Slack.
 */
export const createIssueStep = createStep({
  id: WORKFLOW_STEP_IDS.createIssue,
  description: "Create Linear bug issue from complete bug report",
  inputSchema: ComplexityResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const createLinearIssue = requestContext.get<"createLinearIssue", CreateLinearIssueCommand>(
      "createLinearIssue",
    );
    await createIssueWithMessage(
      thread,
      createLinearIssue,
      inputData.difficulty,
      buildIssueCreatedMessage,
      INTENT_KINDS.bug,
    );
    return {};
  },
});

/**
 * Step 3 (Feature): Create a Linear feature issue and post the URL to Slack.
 */
export const createFeatureIssueStep = createStep({
  id: `${WORKFLOW_STEP_IDS.createIssue}-feature`,
  description: "Create Linear feature issue from complete feature request",
  inputSchema: ComplexityResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const createLinearIssue = requestContext.get<"createLinearIssue", CreateLinearIssueCommand>(
      "createLinearIssue",
    );
    await createIssueWithMessage(
      thread,
      createLinearIssue,
      inputData.difficulty,
      buildIssueCreatedMessage,
      INTENT_KINDS.featureRequest,
    );
    return {};
  },
});

/**
 * Step: Create a Linear bug issue on the max-rounds path.
 */
export const createIssueOnMaxRoundsStep = createStep({
  id: `${WORKFLOW_STEP_IDS.createIssue}-max-rounds`,
  description: "Create Linear bug issue from partial bug report when max rounds reached",
  inputSchema: ComplexityResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const createLinearIssue = requestContext.get<"createLinearIssue", CreateLinearIssueCommand>(
      "createLinearIssue",
    );
    await createIssueWithMessage(
      thread,
      createLinearIssue,
      inputData.difficulty,
      buildMaxRoundsIssueCreatedMessage,
      INTENT_KINDS.bug,
    );
    return {};
  },
});

/**
 * Step: Create a Linear feature issue on the max-rounds path.
 */
export const createFeatureIssueOnMaxRoundsStep = createStep({
  id: `${WORKFLOW_STEP_IDS.createIssue}-max-rounds-feature`,
  description: "Create Linear feature issue from partial feature request when max rounds reached",
  inputSchema: ComplexityResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const createLinearIssue = requestContext.get<"createLinearIssue", CreateLinearIssueCommand>(
      "createLinearIssue",
    );
    await createIssueWithMessage(
      thread,
      createLinearIssue,
      inputData.difficulty,
      buildMaxRoundsIssueCreatedMessage,
      INTENT_KINDS.featureRequest,
    );
    return {};
  },
});

/**
 * Condition: Report is complete.
 */
export const isCompletionCondition = async (params: {
  inputData: EvaluationResult;
}): Promise<boolean> => {
  return params.inputData.isComplete;
};

/**
 * Step: Post a clarifying question to the Slack thread.
 */
export const askStep = createStep({
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
export const hasQuestionAndRoundsCondition = async (params: {
  inputData: EvaluationResult;
}): Promise<boolean> => {
  const { isComplete, clarifyingQuestion, botTurns } = params.inputData;
  return !isComplete && botTurns < MAX_CLARIFICATION_ROUNDS && clarifyingQuestion !== null;
};

/**
 * Step: Escalate an unrecoverable triage as a workflow error.
 */
export const escalateStep = createStep({
  id: WORKFLOW_STEP_IDS.escalate,
  description: "Escalate unrecoverable triage as a workflow error",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    logger.info(
      `[slack-triage] incomplete with rounds remaining but no clarifying question — escalating as workflow error`,
    );
    await thread.unsubscribe();
    throw new InsufficientBugDetailError(inputData.botTurns);
  },
});

/**
 * Condition: Rounds exhausted with incomplete report.
 */
export const maxRoundsCondition = async (params: {
  inputData: EvaluationResult;
}): Promise<boolean> => {
  const { isComplete, botTurns } = params.inputData;
  return !isComplete && botTurns >= MAX_CLARIFICATION_ROUNDS;
};

/**
 * Condition: Report incomplete, rounds remaining, but no clarifying question.
 */
export const escalateCondition = async (params: {
  inputData: EvaluationResult;
}): Promise<boolean> => {
  const { isComplete, botTurns, clarifyingQuestion } = params.inputData;
  return !isComplete && botTurns < MAX_CLARIFICATION_ROUNDS && clarifyingQuestion === null;
};
