import { type Message } from "chat";
import { vi } from "vitest";

export function makeTestMessage(text: string, isMe: boolean): Message {
  return {
    id: "msg-1",
    threadId: "thread-1",
    text,
    author: { userId: "u1", userName: "user", fullName: "User", isBot: isMe, isMe },
    metadata: { dateSent: new Date(), edited: false },
    formatted: {} as Message["formatted"],
    raw: {},
    attachments: [],
    links: [],
    toJSON: vi.fn(),
  } as unknown as Message;
}
