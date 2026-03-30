import { Controller, Post, Req, Res, Inject } from "@nestjs/common";
import type { Request, Response } from "express";
import { SlackWebhookAdapter } from "@/util/slack-webhook.adapter";

@Controller("slack")
export class SlackEventsController {
  constructor(
    @Inject(SlackWebhookAdapter) private readonly slackWebhookAdapter: SlackWebhookAdapter,
  ) {}

  @Post("events")
  async receiveSlackEvent(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.slackWebhookAdapter.handle(req, res);
  }
}
