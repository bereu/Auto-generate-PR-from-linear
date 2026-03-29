import { Injectable, Inject, type OnModuleInit } from "@nestjs/common";
import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { Chat, type Thread } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { EvaluateBugReportCommand } from "@/slack-bug-intake/command/evaluate-bug-report.command";
import { CreateLinearIssueCommand } from "@/slack-bug-intake/command/create-linear-issue.command";
import {
  SLACK_BOT_USERNAME,
  MAX_CLARIFICATION_ROUNDS,
  FALLBACK_MESSAGE,
} from "@/slack-bug-intake/slack-bug-intake.constants";

@Injectable()
export class SlackBotService implements OnModuleInit {
  private chat!: Chat;

  constructor(
    @Inject(EvaluateBugReportCommand) private readonly evaluateBugReport: EvaluateBugReportCommand,
    @Inject(CreateLinearIssueCommand) private readonly createLinearIssue: CreateLinearIssueCommand,
  ) {}

  onModuleInit(): void {
    const slackAdapter = createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
    });

    this.chat = new Chat({
      userName: SLACK_BOT_USERNAME,
      adapters: { slack: slackAdapter },
      state: createMemoryState(),
    });

    this.chat.onNewMention(async (thread, _message) => {
      await thread.subscribe();
      await this.handleIncoming(thread);
    });

    this.chat.onSubscribedMessage(async (thread, _message) => {
      await this.handleIncoming(thread);
    });
  }

  private async handleIncoming(thread: Thread): Promise<void> {
    const { isComplete, clarifyingQuestion } = await this.evaluateBugReport.execute(
      thread.recentMessages,
    );
    const botTurns = thread.recentMessages.filter((m) => m.author.isMe).length;

    if (isComplete) {
      const { url } = await this.createLinearIssue.execute(thread.recentMessages);
      await thread.post(`Linear issue created: ${url}`);
      await thread.unsubscribe();
    } else if (botTurns < MAX_CLARIFICATION_ROUNDS && clarifyingQuestion !== null) {
      await thread.post(clarifyingQuestion);
    } else {
      await thread.post(FALLBACK_MESSAGE);
      await thread.unsubscribe();
    }
  }

  async handleWebhook(req: ExpressRequest, res: ExpressResponse): Promise<void> {
    const rawBody = (req as ExpressRequest & { rawBody?: Buffer }).rawBody;
    const host = req.headers.host ?? "localhost";
    const url = `https://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      }
    }

    const fetchRequest = new Request(url, {
      method: req.method,
      headers,
      body: rawBody ?? null,
    });

    const fetchResponse = await this.chat.webhooks.slack(fetchRequest);

    res.status(fetchResponse.status);
    fetchResponse.headers.forEach((value: string, key: string) => {
      res.setHeader(key, value);
    });
    const body = await fetchResponse.text();
    res.send(body);
  }
}
