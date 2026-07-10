import { BusinessError, INSUFFICIENT_BUG_DETAIL_MESSAGE } from "@/constants/errors/business.error";
import { SYSTEM_ERRORS } from "@/constants/message/error/system.error";
import { ERROR_RESPONSE_MESSAGES } from "@/slack-triage/slack-triage.constants";

/**
 * Result of classifying a triage failure: the user-facing reply to post and
 * whether the failure is a Business Logic Error (expected workflow violation)
 * or a System Error — used to pick the Rollbar severity per BE-003.
 */
export interface TriageErrorResponse {
  message: string;
  isBusinessError: boolean;
}

/** System error messages raised while creating/commenting a Linear issue. */
const LINEAR_ERROR_MESSAGES: readonly string[] = [
  SYSTEM_ERRORS.linearApiKeyNotSet,
  SYSTEM_ERRORS.noLinearTeamFound,
  SYSTEM_ERRORS.linearIssueCreationFailed,
  SYSTEM_ERRORS.teamNotFound,
  SYSTEM_ERRORS.stateNotFound,
  SYSTEM_ERRORS.linearCommentFailed,
];

function matchesKnownMessage(message: string, known: readonly string[]): boolean {
  // `startsWith` because some throw sites append context (e.g. `${teamNotFound} for issue ...`).
  return known.some((entry) => message.startsWith(entry));
}

/**
 * Is this failure an expected Business Logic Error (→ Rollbar `warning`) rather
 * than a System Error (→ `error`)? Checks `instanceof` AND the escalate marker
 * message: Mastra serializes the thrown error across the workflow boundary and
 * strips the class prototype, so `instanceof` alone does not survive (see BE-003).
 */
function isBusinessError(error: Error): boolean {
  return (
    error instanceof BusinessError || error.message.startsWith(INSUFFICIENT_BUG_DETAIL_MESSAGE)
  );
}

/**
 * Map a triage failure to a user-facing reply and its error category.
 *
 * Only two response patterns are implemented: a Linear-creation failure (the one
 * actionable case for the reporter — file it directly in Linear) and a generic
 * fallback for everything else. Severity is classified independently so expected
 * workflow violations are still logged at `warn` (BE-003).
 */
export function classifyTriageError(error: Error): TriageErrorResponse {
  if (matchesKnownMessage(error.message, LINEAR_ERROR_MESSAGES)) {
    return { message: ERROR_RESPONSE_MESSAGES.linearCreationFailed, isBusinessError: false };
  }

  return { message: ERROR_RESPONSE_MESSAGES.unknown, isBusinessError: isBusinessError(error) };
}
