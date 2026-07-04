import { describe, it, expect, vi, beforeEach } from "vitest";

const FIRST_CALL = 0;
const FIRST_ARG = 0;

const { pinoMock, warningMock, errorMock, criticalMock, infoMock, rollbarCtorMock } = vi.hoisted(
  () => ({
    pinoMock: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    warningMock: vi.fn(),
    errorMock: vi.fn(),
    criticalMock: vi.fn(),
    infoMock: vi.fn(),
    rollbarCtorMock: vi.fn(),
  }),
);

vi.mock("pino", () => ({
  default: () => pinoMock,
}));

vi.mock("rollbar", () => ({
  default: class {
    warning = warningMock;
    error = errorMock;
    critical = criticalMock;
    info = infoMock;
    constructor(config: unknown) {
      rollbarCtorMock(config);
    }
  },
}));

vi.mock("@/constants/errors/business.error", () => ({
  BusinessError: class BusinessError extends Error {
    constructor(
      message: string,
      public readonly properties: Record<string, unknown>,
    ) {
      super(message);
      this.name = "BusinessError";
    }
  },
}));

import { Logger, logger } from "@/util/logger";
import { BusinessError } from "@/constants/errors/business.error";

function resetSingleton(): void {
  (Logger as unknown as { instance?: Logger }).instance = undefined;
}

function setupLogger(): void {
  vi.clearAllMocks();
  resetSingleton();
}

describe("logger util - Rollbar configuration", () => {
  beforeEach(() => {
    setupLogger();
  });

  it("constructs Rollbar disabled with scrubFields when no access token", () => {
    delete process.env.ROLLBAR_ACCESS_TOKEN;
    Logger.getInstance().info("boot");

    const config = rollbarCtorMock.mock.calls[FIRST_CALL]?.[FIRST_ARG] as {
      enabled: boolean;
      scrubFields: string[];
      captureUncaught: boolean;
      captureUnhandledRejections: boolean;
    };
    expect(config.enabled).toBe(false);
    expect(config.captureUncaught).toBe(true);
    expect(config.captureUnhandledRejections).toBe(true);
    expect(config.scrubFields).toContain("token");
    expect(config.scrubFields).toContain("password");
    expect(config.scrubFields).toContain("email");
  });
});

describe("logger util - info() / debug()", () => {
  beforeEach(() => {
    setupLogger();
  });

  it("info logs to pino only, never Rollbar", () => {
    logger.info("Info message");
    expect(pinoMock.info).toHaveBeenCalledWith("Info message");
    expect(warningMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("debug logs to pino only, never Rollbar", () => {
    logger.debug("Debug message");
    expect(pinoMock.debug).toHaveBeenCalledWith("Debug message");
    expect(warningMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });
});

describe("logger util - warn()", () => {
  beforeEach(() => {
    setupLogger();
  });

  it("forwards to Rollbar at warning severity", () => {
    logger.warn("Warning message");
    expect(pinoMock.warn).toHaveBeenCalledWith("Warning message");
    expect(warningMock).toHaveBeenCalledWith("Warning message", {});
  });

  it("merges BusinessError.properties into the report", () => {
    const err = new BusinessError("biz", { issueId: "LIN-123" });
    logger.warn("Warning message", { error: err, properties: { custom: "value" } });
    expect(warningMock).toHaveBeenCalledWith("Warning message", {
      issueId: "LIN-123",
      custom: "value",
    });
  });
});

describe("logger util - error()", () => {
  beforeEach(() => {
    setupLogger();
  });

  it("reports a bare string as a system error", () => {
    logger.error("Error message");
    expect(pinoMock.error).toHaveBeenCalledWith("Error message");
    expect(errorMock).toHaveBeenCalledWith(expect.any(Error), {});
    expect(warningMock).not.toHaveBeenCalled();
  });

  it("reports a BusinessError at warning severity (BE-003 business category)", () => {
    const err = new BusinessError("biz", { issueId: "LIN-123" });
    logger.error("Error message", { error: err });
    expect(warningMock).toHaveBeenCalledWith("Error message", { issueId: "LIN-123" });
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("reports a system Error at error severity with properties", () => {
    const err = new Error("System down");
    logger.error("Error message", { error: err, properties: { issueId: "LIN-789" } });
    expect(errorMock).toHaveBeenCalledWith(err, { issueId: "LIN-789" });
    expect(warningMock).not.toHaveBeenCalled();
  });
});

describe("logger util - critical()", () => {
  beforeEach(() => {
    setupLogger();
  });

  it("logs to pino error and reports at critical severity", () => {
    const err = new Error("Fatal boot failure");
    logger.critical(err);
    expect(pinoMock.error).toHaveBeenCalledWith("Fatal boot failure");
    expect(criticalMock).toHaveBeenCalledWith(err, {});
  });
});

describe("logger util - singleton", () => {
  beforeEach(() => {
    setupLogger();
  });

  it("returns the same instance and exports it as logger", () => {
    expect(Logger.getInstance()).toBe(Logger.getInstance());
    expect(logger).toStrictEqual(Logger.getInstance());
  });
});
