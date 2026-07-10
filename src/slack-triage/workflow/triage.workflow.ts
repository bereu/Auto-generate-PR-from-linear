import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import type { Thread } from "chat";
import type { ClassifyMessageQuery } from "@/slack-triage/query/classify-message.query";
import { WORKFLOW_NAMES, WORKFLOW_STEP_IDS } from "@/constants/mastra.constants";
import { INTENT_KINDS } from "@/slack-triage/slack-triage.constants";
import { logger } from "@/util/logger";
import { questionWorkflow, answerQuestionStep } from "@/slack-triage/workflow/question.workflow";
import { bugIntakeWorkflow, featureIntakeWorkflow } from "@/slack-triage/workflow/intake.workflow";
import {
  EvaluationResultSchema,
  IntentResultSchema,
  type IntentResult,
  evaluateStep,
  evaluateFeatureStep,
  assessComplexityStep,
  createIssueStep,
  createFeatureIssueStep,
  createIssueOnMaxRoundsStep,
  createFeatureIssueOnMaxRoundsStep,
  askStep,
  escalateStep,
  isCompletionCondition,
  hasQuestionAndRoundsCondition,
  maxRoundsCondition,
  escalateCondition,
} from "@/slack-triage/workflow/shared-steps";

/**
 * Step: Classify the incoming message intent.
 * Delegates to ClassifyMessageQuery to determine if the user is asking a question,
 * reporting a bug, or requesting a feature. Falls back to "bug" on error (EC1, BE-003).
 */
const classifyStep = createStep({
  id: WORKFLOW_STEP_IDS.classify,
  description: "Classify message intent as question, bug, or feature_request",
  inputSchema: z.object({}),
  outputSchema: IntentResultSchema,
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const classifyMessage = requestContext.get<"classifyMessage", ClassifyMessageQuery>(
      "classifyMessage",
    );

    try {
      const result = await classifyMessage.execute(thread.recentMessages);
      logger.info(`[slack-triage] classified: intent=${result.intent}`);
      return result;
    } catch (error) {
      // EC1: Fall back to "bug" (never lose a report), log at warn (BE-003).
      logger.warn(
        `[slack-triage] classification failed, falling back to bug: ${(error as Error).message}`,
        {
          error: error as Error,
        },
      );
      return { intent: INTENT_KINDS.bug };
    }
  },
});

/**
 * Conditions for intent branching.
 */
const isQuestionCondition = async (params: { inputData: IntentResult }): Promise<boolean> => {
  return params.inputData.intent === INTENT_KINDS.question;
};

const isBugCondition = async (params: { inputData: IntentResult }): Promise<boolean> => {
  return params.inputData.intent === INTENT_KINDS.bug;
};

const isFeatureRequestCondition = async (params: { inputData: IntentResult }): Promise<boolean> => {
  return params.inputData.intent === INTENT_KINDS.featureRequest;
};

/**
 * Triage Workflow
 *
 * Top-level intent-aware router (formerly "bug-triage" — it now handles more than
 * bugs). For each incoming Slack message it:
 * 1. Classifies the intent (question | bug | feature_request)
 * 2. Routes to exactly one nested workflow:
 *    - question        -> questionWorkflow (answer in-thread, stay subscribed)
 *    - bug             -> bugIntakeWorkflow (clarify -> Linear bug issue)
 *    - feature_request -> featureIntakeWorkflow (clarify -> Linear feature issue)
 *
 * The branch conditions form a disjoint + exhaustive partition on the intent enum.
 */
export const triageWorkflow = createWorkflow({
  id: WORKFLOW_NAMES.triage,
  description:
    "Intent-aware Slack message router: answer questions, triage bugs, or process feature requests",
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(classifyStep)
  .branch([
    [isQuestionCondition, questionWorkflow],
    [isBugCondition, bugIntakeWorkflow],
    [isFeatureRequestCondition, featureIntakeWorkflow],
  ])
  .commit();

// Export steps, schemas, and conditions for testing
export {
  classifyStep,
  answerQuestionStep,
  evaluateStep,
  evaluateFeatureStep,
  assessComplexityStep,
  createIssueStep,
  createFeatureIssueStep,
  createIssueOnMaxRoundsStep,
  createFeatureIssueOnMaxRoundsStep,
  askStep,
  escalateStep,
  isCompletionCondition,
  hasQuestionAndRoundsCondition,
  maxRoundsCondition,
  escalateCondition,
  isQuestionCondition,
  isBugCondition,
  isFeatureRequestCondition,
  EvaluationResultSchema,
  IntentResultSchema,
  type IntentResult,
};
