import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { LinearWebhookClient } from "@linear/sdk/webhooks";
import {
  ImplementIssueCommand,
  type RawWebhookPayload,
} from "@/issue/command/implement-issue.command.ts";

export { ISSUE_EVENT_TYPE, ISSUE_TRIGGER_ACTIONS } from "@/repos.config.ts";

@Injectable()
export class IssueEventService {
  constructor(private readonly implementIssue: ImplementIssueCommand) {}

  receiveEvent(rawBody: Buffer, signature: string, timestamp?: string): void {
    const secret = process.env.LINEAR_WEBHOOK_SECRET!;
    const webhookClient = new LinearWebhookClient(secret);

    try {
      webhookClient.verify(rawBody, signature, timestamp);
    } catch {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    let payload: RawWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString()) as RawWebhookPayload;
    } catch {
      throw new BadRequestException("Invalid JSON body");
    }

    this.implementIssue.execute(payload);
  }
}
