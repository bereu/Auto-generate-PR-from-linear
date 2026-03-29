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
  implement(payload: RawWebhookPayload): void {
    if (payload.type !== ISSUE_EVENT_TYPE) return;
    if (!(ISSUE_TRIGGER_ACTIONS as readonly string[]).includes(payload.action)) return;

    const { data } = payload;
    if (!data.labels.some((l) => l.name === LINEAR_LABEL)) return;
    if (data.state.name !== LINEAR_STATES.todo) return;

    const issue = LinearIssue.reconstruct(
      data.id,
      data.title,
      data.description ?? null,
      data.url,
      data.labels.map((l) => l.name),
    );

    logger.info(
      `[implement-issue] Dispatching agent for ${issue.id().value()}: ${issue.title().value()}`,
    );
    processIssue(issue).catch((err: Error) => {
      logger.error(`[implement-issue] Failed for ${issue.id().value()}: ${err.message}`);
    });
  }
}
