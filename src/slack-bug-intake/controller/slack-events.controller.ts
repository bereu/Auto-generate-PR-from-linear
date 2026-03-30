import { Controller, Post, Req, Res, Inject } from "@nestjs/common";
import type { Request, Response } from "express";
import { SlackBotCoordinator } from "@/slack-bug-intake/coordinator/slack-bot.coordinator";

@Controller("slack")
export class SlackEventsController {
  constructor(
    @Inject(SlackBotCoordinator) private readonly slackBotCoordinator: SlackBotCoordinator,
  ) {}

  @Post("events")
  async receiveSlackEvent(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.slackBotCoordinator.handleWebhook(req, res);
  }
}
