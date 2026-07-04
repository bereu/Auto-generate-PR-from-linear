import pino from "pino";
import RollbarSDK from "rollbar";
import { BusinessError } from "@/constants/errors/business.error";

export interface LogContext {
  error?: Error;
  properties?: Record<string, unknown>;
}

/**
 * Fields whose values Rollbar scrubs (replaces with `*`) before a payload leaves
 * the process. Enforces BE-003's rule: never send secrets/tokens/PII to Rollbar.
 */
const ROLLBAR_SCRUB_FIELDS = [
  "token",
  "accessToken",
  "access_token",
  "secret",
  "password",
  "authorization",
  "apiKey",
  "api_key",
  "signature",
  "email",
];

/**
 * Logger singleton — the single cross-cutting observability utility.
 *
 * It owns BOTH local structured logging (pino) AND remote error reporting
 * (Rollbar, per BE-003); the two were previously split across `logger` and a
 * separate `rollbar` singleton with duplicated responsibility, now unified here.
 * Observability infrastructure lives in `src/util` (see BE-001 / GEN-002), not
 * the Transfer layer, and every layer may reference it directly.
 *
 * Rollbar reporting degrades gracefully: when `ROLLBAR_ACCESS_TOKEN` is unset
 * (local dev, tests) the client is created with `enabled: false`, so every
 * forwarded report is a silent no-op and the app never hard-fails.
 *
 * Severity mapping (BE-003 categorization):
 * - `warn(...)`               → Rollbar `warning`
 * - `error(...)` business err → Rollbar `warning` (expected workflow violation)
 * - `error(...)` system err   → Rollbar `error`
 * - `critical(...)`           → Rollbar `critical` (fatal/bootstrap failures)
 */
export class Logger {
  private static instance: Logger;
  private readonly _pino: pino.Logger;
  private readonly _rollbar: RollbarSDK;

  private constructor() {
    this._pino = Logger.createPino();
    this._rollbar = this.createRollbar();
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private static createPino(): pino.Logger {
    const isDev = process.env.NODE_ENV !== "production";
    return pino({
      level: process.env.LOG_LEVEL ?? "info",
      transport: isDev
        ? {
            target: "pino-pretty",
            options: { colorize: true, ignore: "pid,hostname", translateTime: "SYS:standard" },
          }
        : undefined,
    });
  }

  private createRollbar(): RollbarSDK {
    const accessToken = process.env.ROLLBAR_ACCESS_TOKEN;
    const enabled = Boolean(accessToken);
    if (!enabled) {
      this._pino.warn("[rollbar] ROLLBAR_ACCESS_TOKEN not set — error reporting disabled");
    }
    return new RollbarSDK({
      accessToken,
      enabled,
      environment: process.env.ROLLBAR_ENVIRONMENT ?? process.env.NODE_ENV ?? "development",
      captureUncaught: true,
      captureUnhandledRejections: true,
      scrubFields: ROLLBAR_SCRUB_FIELDS,
      payload: { code_version: process.env.ROLLBAR_CODE_VERSION },
    });
  }

  /**
   * Merges a `BusinessError`'s curated `properties` into caller-supplied context
   * so Rollbar reports are property-rich (BE-003). Explicit `properties` win.
   */
  private buildCustomData(ctx?: LogContext): Record<string, unknown> {
    const fromError = ctx?.error instanceof BusinessError ? ctx.error.properties : {};
    return { ...fromError, ...ctx?.properties };
  }

  info(msg: string): void {
    this._pino.info(msg);
  }

  debug(msg: string): void {
    this._pino.debug(msg);
  }

  /** Logs a warning locally and reports it to Rollbar at `warning` severity. */
  warn(msg: string, ctx?: LogContext): void {
    this._pino.warn(msg);
    this._rollbar.warning(msg, this.buildCustomData(ctx));
  }

  /**
   * Logs an error locally and reports it to Rollbar. Business-logic errors are
   * reported as warnings (expected), system errors as errors (unexpected).
   */
  error(msg: string, ctx?: LogContext): void {
    this._pino.error(msg);
    const err = ctx?.error;
    if (err instanceof BusinessError) {
      this._rollbar.warning(msg, this.buildCustomData(ctx));
    } else {
      this._rollbar.error(err ?? new Error(msg), this.buildCustomData(ctx));
    }
  }

  /** Logs a fatal error locally and reports it to Rollbar at `critical` severity. */
  critical(error: Error, ctx?: LogContext): void {
    this._pino.error(error.message);
    this._rollbar.critical(error, this.buildCustomData({ error, ...ctx }));
  }
}

export const logger = Logger.getInstance();
