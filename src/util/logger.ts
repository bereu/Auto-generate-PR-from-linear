import pino from "pino";

export class Logger {
  private static instance: Logger;
  private readonly _pino: pino.Logger;

  private constructor() {
    const isDev = process.env.NODE_ENV !== "production";
    this._pino = pino({
      level: process.env.LOG_LEVEL || "info",
      transport: isDev
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              ignore: "pid,hostname",
              translateTime: "SYS:standard",
            },
          }
        : undefined,
    });
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  info(msg: string): void {
    this._pino.info(msg);
  }

  warn(msg: string): void {
    this._pino.warn(msg);
  }

  error(msg: string): void {
    this._pino.error(msg);
  }

  debug(msg: string): void {
    this._pino.debug(msg);
  }
}

export const logger = Logger.getInstance();
