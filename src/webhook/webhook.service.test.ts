import "reflect-metadata";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";
import { UnauthorizedException, BadRequestException } from "@nestjs/common";
import { WebhookService } from "./webhook.service.js";

vi.mock("@/agent.js", () => ({
  processIssue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/logger.js", () => ({
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
  action: "update",
  type: "Issue",
  data: {
    id: "abc123",
    title: "Fix login",
    description: "Details here",
    url: "https://linear.app/issue/abc123",
    state: { name: "Todo" },
    labels: [{ name: "agent" }],
  },
};

describe("WebhookService", () => {
  let service: WebhookService;

  beforeEach(() => {
    process.env.LINEAR_WEBHOOK_SECRET = SECRET;
    vi.clearAllMocks();
    service = new WebhookService();
  });

  describe("handleWebhook — signature verification", () => {
    it("throws 401 when signature is invalid", () => {
      const raw = makeRawBody(validPayload);
      expect(() => service.handleWebhook(raw, "bad-signature")).toThrow(UnauthorizedException);
    });

    it("accepts valid HMAC-SHA256 signature", async () => {
      const raw = makeRawBody(validPayload);
      const sig = makeSignature(raw.toString());
      const { processIssue } = await import("@/agent.js");
      service.handleWebhook(raw, sig);
      await new Promise((r) => setTimeout(r, 0)); // flush microtasks
      expect(processIssue).toHaveBeenCalledOnce();
    });
  });

  describe("handleWebhook — filtering", () => {
    async function handle(payload: object): Promise<void> {
      const raw = makeRawBody(payload);
      const sig = makeSignature(raw.toString());
      service.handleWebhook(raw, sig);
      await new Promise((r) => setTimeout(r, 0));
    }

    it("ignores events where type is not Issue", async () => {
      const { processIssue } = await import("@/agent.js");
      await handle({ ...validPayload, type: "Comment" });
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("ignores events with non-create/update actions", async () => {
      const { processIssue } = await import("@/agent.js");
      await handle({ ...validPayload, action: "remove" });
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("ignores issues without 'agent' label", async () => {
      const { processIssue } = await import("@/agent.js");
      const payload = {
        ...validPayload,
        data: { ...validPayload.data, labels: [{ name: "bug" }] },
      };
      await handle(payload);
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("ignores issues not in Todo state", async () => {
      const { processIssue } = await import("@/agent.js");
      const payload = {
        ...validPayload,
        data: { ...validPayload.data, state: { name: "In Progress" } },
      };
      await handle(payload);
      expect(processIssue).not.toHaveBeenCalled();
    });

    it("triggers processIssue for agent-labeled Todo issues", async () => {
      const { processIssue } = await import("@/agent.js");
      await handle(validPayload);
      expect(processIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "abc123",
          title: "Fix login",
          description: "Details here",
          url: "https://linear.app/issue/abc123",
        }),
      );
    });

    it("passes null description when missing", async () => {
      const { processIssue } = await import("@/agent.js");
      const payload = {
        ...validPayload,
        data: { ...validPayload.data, description: undefined },
      };
      await handle(payload);
      expect(processIssue).toHaveBeenCalledWith(expect.objectContaining({ description: null }));
    });
  });

  describe("handleWebhook — error handling", () => {
    it("throws BadRequestException on malformed JSON body", () => {
      const raw = Buffer.from("not-json");
      const sig = makeSignature("not-json");
      expect(() => service.handleWebhook(raw, sig)).toThrow(BadRequestException);
    });

    it("logs error when processIssue rejects", async () => {
      const { processIssue } = await import("@/agent.js");
      const { logger } = await import("@/logger.js");
      vi.mocked(processIssue).mockRejectedValueOnce(new Error("boom"));

      const raw = makeRawBody(validPayload);
      const sig = makeSignature(raw.toString());
      service.handleWebhook(raw, sig);
      await new Promise((r) => setTimeout(r, 0));

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("boom"));
    });
  });
});
