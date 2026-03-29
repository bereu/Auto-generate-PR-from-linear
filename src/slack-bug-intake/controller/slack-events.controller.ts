import { Controller, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { SlackBotService } from "@/slack-bug-intake/slack-bot.service";

@Controller("slack")
export class SlackEventsController {
  constructor(private readonly slackBotService: SlackBotService) {}

  @Post("events")
  async receiveSlackEvent(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.slackBotService.handleWebhook(req, res);
  }
}
