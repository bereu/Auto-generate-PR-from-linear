import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dayjs.extend(utc);
dayjs.extend(timezone);

export class TimeManagement {
  private static instance: TimeManagement;
  private readonly _tz: string;

  private constructor() {
    this._tz = process.env.TZ || "UTC";
  }

  static getInstance(): TimeManagement {
    if (!TimeManagement.instance) {
      TimeManagement.instance = new TimeManagement();
    }
    return TimeManagement.instance;
  }

  now(): Dayjs {
    return dayjs().tz(this._tz);
  }

  format(
    date?: string | number | Date | Dayjs,
    formatString: string = "YYYY-MM-DD HH:mm:ss",
  ): string {
    return dayjs(date).tz(this._tz).format(formatString);
  }

  utc(): Dayjs {
    return dayjs.utc();
  }

  parse(date: string | number | Date): Dayjs {
    return dayjs(date).tz(this._tz);
  }

  timezone(): string {
    return this._tz;
  }
}

export const timemanagement = TimeManagement.getInstance();
