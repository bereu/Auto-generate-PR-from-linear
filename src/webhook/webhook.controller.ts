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
import { LINEAR_WEBHOOK_SIGNATURE_HEADER, LINEAR_WEBHOOK_TS_HEADER } from "@linear/sdk/webhooks";
import { IssueEventService } from "./webhook.service.ts";

@Controller()
export class WebhookController {
  constructor(@Inject(IssueEventService) private readonly issueEventService: IssueEventService) {}

  @Post("webhook")
  @HttpCode(200)
  receiveLinearEvent(
    @Req() req: Request,
    @Headers(LINEAR_WEBHOOK_SIGNATURE_HEADER) signature: string,
    @Headers(LINEAR_WEBHOOK_TS_HEADER) timestamp: string | undefined,
  ): { ok: boolean } {
    if (!signature) {
      throw new UnauthorizedException("Missing linear-signature header");
    }
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw new BadRequestException("Missing raw body");
    }
    this.issueEventService.receiveEvent(rawBody, signature, timestamp);
    return { ok: true };
  }

  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }
}
