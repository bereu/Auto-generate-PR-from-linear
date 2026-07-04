import { Injectable } from "@nestjs/common";
import { processIssue } from "@/agent";
import { LinearIssue } from "@/domain/issue/linear-issue";
import {
  LINEAR_LABEL,
  LINEAR_STATES,
  ISSUE_EVENT_TYPE,
  ISSUE_TRIGGER_ACTIONS,
} from "@/repos.config";
import { logger } from "@/util/logger";

export interface RawWebhookLabel {
  name: string;
}

export interface RawWebhookState {
  name: string;
}

export interface RawWebhookData {
  id: string;
  title: string;
  description?: string;
  url: string;
  state: RawWebhookState;
  labels: RawWebhookLabel[];
}

export interface RawWebhookPayload {
  action: string;
  type: string;
  data: RawWebhookData;
}

@Injectable()
export class ImplementIssueCommand {
  private isValidEventType(payload: RawWebhookPayload): boolean {
    return payload.type === ISSUE_EVENT_TYPE;
  }

  private isValidAction(payload: RawWebhookPayload): boolean {
    return (ISSUE_TRIGGER_ACTIONS as readonly string[]).includes(payload.action);
  }

  private hasAgentLabel(data: RawWebhookData): boolean {
    return data.labels.some((l) => l.name === LINEAR_LABEL);
  }

  private isInTodoState(data: RawWebhookData): boolean {
    return data.state.name === LINEAR_STATES.todo;
  }

  private shouldProcess(payload: RawWebhookPayload): boolean {
    if (!this.isValidEventType(payload)) return false;
    if (!this.isValidAction(payload)) return false;
    if (!this.hasAgentLabel(payload.data)) return false;
    if (!this.isInTodoState(payload.data)) return false;
    return true;
  }

  private reconstructIssue(data: RawWebhookData): LinearIssue {
    return LinearIssue.reconstruct(
      data.id,
      data.title,
      data.description ?? null,
      data.url,
      data.labels.map((l) => l.name),
    );
  }

  implement(payload: RawWebhookPayload): void {
    if (!this.shouldProcess(payload)) return;

    const issue = this.reconstructIssue(payload.data);
    logger.info(
      `[implement-issue] Dispatching agent for ${issue.id().value()}: ${issue.title().value()}`,
    );
    processIssue(issue).catch((err: Error) => {
      logger.error(`[implement-issue] Failed for ${issue.id().value()}: ${err.message}`);
    });
  }
}
