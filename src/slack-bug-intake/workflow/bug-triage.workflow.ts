import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import type { Thread } from "chat";
import type { ClassifyMessageQuery } from "@/slack-bug-intake/query/classify-message.query";
import type { AnswerQuestionQuery } from "@/slack-bug-intake/query/answer-question.query";
import { WORKFLOW_NAMES, WORKFLOW_STEP_IDS } from "@/constants/mastra.constants";
import { INTENT_KINDS } from "@/slack-bug-intake/slack-bug-intake.constants";
import { logger } from "@/util/logger";
import {
  bugIntakeWorkflow,
  featureIntakeWorkflow,
} from "@/slack-bug-intake/workflow/intake.workflow";
import {
  EvaluationResultSchema,
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
} from "@/slack-bug-intake/workflow/shared-steps";

/**
 * Schema for the intent classification result.
 */
const IntentResultSchema = z.object({
  intent: z.enum([INTENT_KINDS.question, INTENT_KINDS.bug, INTENT_KINDS.featureRequest]),
});

type IntentResult = z.infer<typeof IntentResultSchema>;

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
 * Step: Answer a question in-thread and remain subscribed.
 * Delegates to AnswerQuestionQuery to generate an answer. Posts the answer to the thread
 * but does NOT unsubscribe (EC2: on failure, posts apology and stays subscribed).
 */
const answerQuestionStep = createStep({
  id: WORKFLOW_STEP_IDS.answer,
  description: "Answer question and remain subscribed",
  inputSchema: IntentResultSchema,
  outputSchema: z.object({}),
  async execute({ inputData: _inputData, requestContext }) {
    const thread = requestContext.get<"thread", Thread>("thread");
    const answerQuestion = requestContext.get<"answerQuestion", AnswerQuestionQuery>(
      "answerQuestion",
    );

    try {
      const { answer } = await answerQuestion.execute(thread.recentMessages);
      logger.info(`[slack-triage] answered question`);
      await thread.post(answer);
      return {};
    } catch (error) {
      // EC2: Post graceful apology, stay subscribed, log warn (BE-003).
      logger.warn(`[slack-triage] answer generation failed: ${(error as Error).message}`, {
        error: error as Error,
      });
      const failureMessage =
        "I couldn't generate an answer to your question. I'm still monitoring this thread, so feel free to ask again or file an issue if you encounter a bug.";
      await thread.post(failureMessage);
      return {};
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
 * Main Bug Triage Workflow
 *
 * Top-level intent-aware triage router:
 * 1. Classify the incoming message (question | bug | feature_request)
 * 2. Route to the appropriate intake path
 */
export const bugTriageWorkflow = createWorkflow({
  id: WORKFLOW_NAMES.bugTriage,
  description:
    "Intent-aware Slack message router: answer questions, triage bugs, or process feature requests",
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(classifyStep)
  .branch([
    [isQuestionCondition, answerQuestionStep],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [isBugCondition, bugIntakeWorkflow as any],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [isFeatureRequestCondition, featureIntakeWorkflow as any],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any)
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
