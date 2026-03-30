import { Injectable, Inject } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { SlackTransfer } from "@/transfer/slack.transfer";
import { dispatchWebhook } from "@/util/webhook-adapter";

@Injectable()
export class SlackWebhookAdapter {
  constructor(@Inject(SlackTransfer) private readonly slackTransfer: SlackTransfer) {}

  async handle(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    await dispatchWebhook(req, res, (request) => this.slackTransfer.chat.webhooks.slack(request));
  }
}
