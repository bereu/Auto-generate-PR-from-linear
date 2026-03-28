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
import {
  LINEAR_WEBHOOK_SIGNATURE_HEADER,
  LINEAR_WEBHOOK_TS_HEADER,
  LinearWebhookClient,
} from "@linear/sdk/webhooks";
import {
  ImplementIssueCommand,
  type RawWebhookPayload,
} from "@/linear-webhook/command/implement-issue.command";

@Controller()
export class LinearWebhookController {
  constructor(
    @Inject(ImplementIssueCommand) private readonly implementIssue: ImplementIssueCommand,
  ) {}

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

    this.receiveEvent(rawBody, signature, timestamp);
    return { ok: true };
  }

  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }

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

    this.implementIssue.implement(payload);
  }
}
