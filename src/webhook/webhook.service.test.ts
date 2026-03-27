import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { UnauthorizedException, BadRequestException } from "@nestjs/common";
import { IssueEventService, ISSUE_EVENT_TYPE, ISSUE_TRIGGER_ACTIONS } from "./webhook.service.ts";
import { ImplementIssueCommand } from "@/issue/command/implement-issue.command.ts";
import { LINEAR_STATES, LINEAR_LABEL } from "@/repos.config.ts";
import { LinearIssue } from "@/issue/domain/linear-issue.ts";

vi.mock("@/agent.ts", () => ({
  processIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/logger.ts", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const SECRET = "test-webhook-secret";

function makeSignature(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(Buffer.from(body)).digest("hex");
}

function makeRawBody(payload: object): Buffer {
  return Buffer.from(JSON.stringify(payload));
}

const validPayload = {
  action: ISSUE_TRIGGER_ACTIONS[1],
  type: ISSUE_EVENT_TYPE,
  data: {
    id: "abc123",
    title: "Fix login",
    description: "Details here",
    url: "https://linear.app/issue/abc123",
    state: { name: LINEAR_STATES.todo },
    labels: [{ name: LINEAR_LABEL }],
  },
};

describe("IssueEventService", () => {
  let service: IssueEventService;

  beforeEach(() => {
    process.env.LINEAR_WEBHOOK_SECRET = SECRET;
    vi.clearAllMocks();
    service = new IssueEventService(new ImplementIssueCommand());
  });

  describe("receiveEvent — signature verification", () => {
    it("throws 401 when signature is invalid", () => {
      const raw = makeRawBody(validPayload);
      expect(() => service.receiveEvent(raw, "bad-signature")).toThrow(UnauthorizedException);
    });

    it("accepts valid HMAC-SHA256 signature", async () => {
      const raw = makeRawBody(validPayload);
      const sig = makeSignature(raw.toString());
      const { processIssue } = await import("@/agent.ts");
      service.receiveEvent(raw, sig);
      await new Promise((r) => setTimeout(r, 0)); // flush microtasks
      expect(processIssue).toHaveBeenCalledOnce();
    });
  });

  describe("receiveEvent — filtering", () => {
    async function handle(payload: object): Promise<void> {
      const raw = makeRawBody(payload);
      const sig = makeSignature(raw.toString());
      service.receiveEvent(raw, sig);
      await new Promise((r) => setTimeout(r, 0));
    }

    it("ignores events where type is not Issue", async () => {
      const { processIssue } = await import("@/agent.ts");
      await handle({ ...validPayload, type: "Comment" });
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("ignores events with non-create/update actions", async () => {
      const { processIssue } = await import("@/agent.ts");
      await handle({ ...validPayload, action: "remove" });
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("triggers processIssue for create action", async () => {
      const { processIssue } = await import("@/agent.ts");
      await handle({ ...validPayload, action: ISSUE_TRIGGER_ACTIONS[0] });
      expect(processIssue).toHaveBeenCalledOnce();
    });

    it("ignores issues without 'agent' label", async () => {
      const { processIssue } = await import("@/agent.ts");
      const payload = {
        ...validPayload,
        data: { ...validPayload.data, labels: [{ name: "bug" }] },
      };
      await handle(payload);
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("ignores issues not in Todo state", async () => {
      const { processIssue } = await import("@/agent.ts");
      const payload = {
        ...validPayload,
        data: { ...validPayload.data, state: { name: LINEAR_STATES.inProgress } },
      };
      await handle(payload);
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("triggers processIssue for agent-labeled Todo issues", async () => {
      const { processIssue } = await import("@/agent.ts");
      await handle(validPayload);
      expect(processIssue).toHaveBeenCalledOnce();
      const [calledIssue] = vi.mocked(processIssue).mock.calls[0] as [LinearIssue];
      expect(calledIssue.id().value()).toBe("abc123");
      expect(calledIssue.title().value()).toBe("Fix login");
      expect(calledIssue.description()).toBe("Details here");
      expect(calledIssue.url()).toBe("https://linear.app/issue/abc123");
    });

    it("passes null description when missing", async () => {
      const { processIssue } = await import("@/agent.ts");
      const payload = {
        ...validPayload,
        data: { ...validPayload.data, description: undefined },
      };
      await handle(payload);
      expect(processIssue).toHaveBeenCalledOnce();
      const [calledIssue] = vi.mocked(processIssue).mock.calls[0] as [LinearIssue];
      expect(calledIssue.description()).toBeNull();
    });
  });

  describe("receiveEvent — error handling", () => {
    it("throws BadRequestException on malformed JSON body", () => {
      const raw = Buffer.from("not-json");
      const sig = makeSignature("not-json");
      expect(() => service.receiveEvent(raw, sig)).toThrow(BadRequestException);
    });

    it("logs error when processIssue rejects", async () => {
      const { processIssue } = await import("@/agent.ts");
      const { logger } = await import("@/logger.ts");
      vi.mocked(processIssue).mockRejectedValueOnce(new Error("boom"));

      const raw = makeRawBody(validPayload);
      const sig = makeSignature(raw.toString());
      service.receiveEvent(raw, sig);
      await new Promise((r) => setTimeout(r, 0));

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
    });
  });
});
