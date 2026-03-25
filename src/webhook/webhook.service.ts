import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "crypto";
import { processIssue } from "@/agent.js";
import { LINEAR_LABEL, LINEAR_STATES } from "@/repos.config.js";
import { logger } from "@/logger.js";
import type { LinearIssue } from "@/linear.js";

const WEBHOOK_TYPE_ISSUE = "Issue";
const WEBHOOK_ACTIONS = ["create", "update"] as const;

interface LinearWebhookLabel {
  name: string;
}

interface LinearWebhookState {
  name: string;
}

interface LinearWebhookData {
  id: string;
  title: string;
  description?: string;
  url: string;
  state: LinearWebhookState;
  labels: LinearWebhookLabel[];
}

interface LinearWebhookPayload {
  action: string;
  type: string;
  data: LinearWebhookData;
}

@Injectable()
export class WebhookService {
  private verifySignature(secret: string, rawBody: Buffer, signature: string): boolean {
    const hmac = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expected = Buffer.from(hmac);
    const received = Buffer.from(signature);
    if (expected.length !== received.length) return false;
    return timingSafeEqual(expected, received);
  }

  handleWebhook(rawBody: Buffer, signature: string): void {
    const secret = process.env.LINEAR_WEBHOOK_SECRET!;
    if (!this.verifySignature(secret, rawBody, signature)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    let payload: LinearWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString()) as LinearWebhookPayload;
    } catch {
      throw new BadRequestException("Invalid JSON body");
    }

    if (payload.type !== WEBHOOK_TYPE_ISSUE) return;
    if (!(WEBHOOK_ACTIONS as readonly string[]).includes(payload.action)) return;

    const { data } = payload;
    const hasAgentLabel = data.labels.some((l) => l.name === LINEAR_LABEL);
    if (!hasAgentLabel) return;

    if (data.state.name !== LINEAR_STATES.todo) return;

    const issue: LinearIssue = {
      id: data.id,
      title: data.title,
      description: data.description ?? null,
      url: data.url,
      labels: { nodes: data.labels },
    };

    logger.info(`[webhook] Triggering processIssue for ${issue.id}: ${issue.title}`);
    processIssue(issue).catch((err: Error) => {
      logger.error(`[webhook] processIssue failed for ${issue.id}: ${err.message}`);
    });
  }
}
