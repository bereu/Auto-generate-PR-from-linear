import { z } from "zod";
import { createWorkflow, createStep } from "@mastra/core/workflows";
import type { Thread } from "chat";
import type { AnswerQuestionQuery } from "@/slack-triage/query/answer-question.query";
import { WORKFLOW_NAMES, WORKFLOW_STEP_IDS } from "@/constants/mastra.constants";
import { ANSWER_FAILED_MESSAGE } from "@/slack-triage/slack-triage.constants";
import { logger } from "@/util/logger";
import { IntentResultSchema } from "@/slack-triage/workflow/shared-steps";

/**
 * Step: Answer a question in-thread and remain subscribed.
 * Delegates to AnswerQuestionQuery to generate an answer. Posts the answer to the
 * thread but does NOT unsubscribe (EC2: on failure, posts an apology and stays
 * subscribed so the user can retry).
 */
export const answerQuestionStep = createStep({
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
      await thread.post(ANSWER_FAILED_MESSAGE);
      return {};
    }
  },
});

/**
 * Question Workflow
 *
 * Handles the "question" intent: generate an answer from domain docs + general
 * knowledge, post it in-thread, and stay subscribed for follow-ups. Wrapped as a
 * workflow (mirroring the bug/feature intake workflows) so the top-level triage
 * router composes one nested workflow per intent.
 */
export const questionWorkflow = createWorkflow({
  id: WORKFLOW_NAMES.question,
  description: "Answer a Slack question in-thread and remain subscribed",
  inputSchema: IntentResultSchema,
  outputSchema: z.object({}),
})
  .then(answerQuestionStep)
  .commit();
