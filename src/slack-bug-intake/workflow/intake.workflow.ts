import { z } from "zod";
import { createWorkflow } from "@mastra/core/workflows";
import { WORKFLOW_NAMES } from "@/constants/mastra.constants";
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
 * Nested completion workflow: chains assess complexity → create bug issue (complete path).
 */
const completionWorkflow = createWorkflow({
  id: `${WORKFLOW_NAMES.bugIntake}-completion`,
  description: "Assess complexity and create Linear bug issue",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
})
  .then(assessComplexityStep)
  .then(createIssueStep)
  .commit();

/**
 * Nested max-rounds workflow: chains assess complexity → create bug issue on partial detail path.
 */
const maxRoundsWorkflow = createWorkflow({
  id: `${WORKFLOW_NAMES.bugIntake}-max-rounds`,
  description: "Assess complexity and create best-effort Linear bug issue when max rounds reached",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
})
  .then(assessComplexityStep)
  .then(createIssueOnMaxRoundsStep)
  .commit();

/**
 * Bug Intake Workflow
 *
 * Orchestrates the Slack bug report clarification loop.
 */
export const bugIntakeWorkflow = createWorkflow({
  id: WORKFLOW_NAMES.bugIntake,
  description: "Evaluate Slack bug report, ask clarifying questions, or create Linear bug issue",
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(evaluateStep)
  .branch([
    [isCompletionCondition, completionWorkflow],
    [hasQuestionAndRoundsCondition, askStep],
    [maxRoundsCondition, maxRoundsWorkflow],
    [escalateCondition, escalateStep],
  ])
  .commit();

/**
 * Nested feature completion workflow: chains assess complexity → create feature issue (complete path).
 */
const featureCompletionWorkflow = createWorkflow({
  id: `${WORKFLOW_NAMES.featureIntake}-completion`,
  description: "Assess complexity and create Linear feature issue",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
})
  .then(assessComplexityStep)
  .then(createFeatureIssueStep)
  .commit();

/**
 * Nested feature max-rounds workflow: chains assess complexity → create feature issue on partial detail path.
 */
const featureMaxRoundsWorkflow = createWorkflow({
  id: `${WORKFLOW_NAMES.featureIntake}-max-rounds`,
  description:
    "Assess complexity and create best-effort Linear feature issue when max rounds reached",
  inputSchema: EvaluationResultSchema,
  outputSchema: z.object({}),
})
  .then(assessComplexityStep)
  .then(createFeatureIssueOnMaxRoundsStep)
  .commit();

/**
 * Feature Intake Workflow
 *
 * Orchestrates the Slack feature request clarification loop.
 */
export const featureIntakeWorkflow = createWorkflow({
  id: WORKFLOW_NAMES.featureIntake,
  description:
    "Evaluate Slack feature request, ask clarifying questions, or create Linear feature issue",
  inputSchema: z.object({}),
  outputSchema: z.object({}),
})
  .then(evaluateFeatureStep)
  .branch([
    [isCompletionCondition, featureCompletionWorkflow],
    [hasQuestionAndRoundsCondition, askStep],
    [maxRoundsCondition, featureMaxRoundsWorkflow],
    [escalateCondition, escalateStep],
  ])
  .commit();
