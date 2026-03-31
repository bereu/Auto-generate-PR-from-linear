import { Injectable } from "@nestjs/common";
import { Chat, type Thread, type Message } from "chat";
import { createSlackAdapter } from "@chat-adapter/slack";
import { createMemoryState } from "@chat-adapter/state-memory";
import { SLACK_BOT_USERNAME } from "@/slack-bug-intake/slack-bug-intake.constants";

type MentionHandler = (thread: Thread, message: Message) => Promise<void>;

@Injectable()
export class SlackTransfer {
  chat: Chat;

  constructor() {
    const slackAdapter = createSlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
    });

    this.chat = new Chat({
      userName: SLACK_BOT_USERNAME,
      adapters: { slack: slackAdapter },
      state: createMemoryState(),
    });
  }

  onNewMention(handler: MentionHandler): void {
    this.chat.onNewMention(handler);
  }

  onSubscribedMessage(handler: MentionHandler): void {
    this.chat.onSubscribedMessage(handler);
  }
}
