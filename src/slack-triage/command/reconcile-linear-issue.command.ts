import { Injectable } from "@nestjs/common";
import { LinearTransfer } from "@/transfer/linear.transfer";
import { logger } from "@/util/logger";
import { LINEAR_AGENT_LABEL } from "@/slack-triage/slack-triage.constants";
import { LINEAR_STATES } from "@/repos.config";

/**
 * ReconcileLinearIssueCommand: enforce the deterministic invariant (label `agent` +
 * state `Todo`) that gates the downstream Linear webhook.
 *
 * **Why this Command exists:**
 * The triage agent creates a Linear issue via MCP. However, MCP tool calls are
 * orchestrated by the LLM, which is probabilistic and may fail to set labels/state
 * correctly. The downstream webhook (processing by `src/agent.ts`) fires ONLY when
 * an issue has label `agent` AND state `Todo`. This invariant MUST NOT be left
 * solely to the LLM.
 *
 * **Responsibility (per BE-001):**
 * After the agent creates an issue, this Command verifies and **enforces** that
 * the `agent` label and `Todo` state are set, ensuring the downstream webhook
 * will fire. If the agent created the issue without the label/state, this Command
 * applies them deterministically.
 *
 * **Note on implementation:**
 * This is a thin wrapper over `LinearTransfer` read/write methods. Future enhancements
 * (e.g. setting difficulty label) can be added here; the reconciliation responsibility
 * stays in the Command layer.
 */
@Injectable()
export class ReconcileLinearIssueCommand {
  constructor(private readonly linearTransfer: LinearTransfer) {}

  /**
   * Verify and enforce the `agent` label + `Todo` state on a Linear issue.
   *
   * @param issueId Linear issue ID (e.g. "LIN-123")
   * @throws BusinessError if the label is rejected; SystemError if the transfer fails
   */
  async execute(issueId: string): Promise<void> {
    logger.debug(`[reconcile-linear-issue] Verifying issue ${issueId}`);

    try {
      const issue = await this.linearTransfer.fetchIssueById(issueId);
      if (!issue) {
        throw new Error(`Issue ${issueId} not found`);
      }

      await this.enforceAgentLabel(issueId, issue.labels);
      await this.enforceTodoState(issueId, issue.state);

      logger.info(`[reconcile-linear-issue] Issue ${issueId} reconciliation complete`);
    } catch (error) {
      logger.error(`[reconcile-linear-issue] Failed to reconcile issue ${issueId}`, {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    }
  }

  private async enforceAgentLabel(issueId: string, labels: string[]): Promise<void> {
    if (!labels.includes(LINEAR_AGENT_LABEL)) {
      await this.linearTransfer.addLabel(issueId, LINEAR_AGENT_LABEL);
    }
  }

  private async enforceTodoState(issueId: string, state: string | undefined): Promise<void> {
    if (state !== LINEAR_STATES.todo) {
      await this.linearTransfer.changeState(issueId, LINEAR_STATES.todo);
    }
  }
}
