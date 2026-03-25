import {
  Controller,
  Post,
  Get,
  Headers,
  Req,
  HttpCode,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import type { Request } from "express";
import { WebhookService } from "./webhook.service.js";

@Controller()
export class WebhookController {
  constructor(@Inject(WebhookService) private readonly webhookService: WebhookService) {}

  @Post("webhook")
  @HttpCode(200)
  receiveWebhook(
    @Req() req: Request,
    @Headers("linear-signature") signature: string,
  ): { ok: boolean } {
    if (!signature) {
      throw new UnauthorizedException("Missing linear-signature header");
    }
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException("Missing raw body");
    }
    this.webhookService.handleWebhook(rawBody, signature);
    return { ok: true };
  }

  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }
}
