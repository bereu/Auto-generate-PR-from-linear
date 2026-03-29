import { DOMAIN_ERRORS } from "@/constants/message/error/domain.error";

export class BugReport {
  private constructor(
    private readonly _title: string,
    private readonly _description: string,
  ) {}

  static create(title: string, description: string): BugReport {
    if (!title.trim()) throw new Error(DOMAIN_ERRORS.bugReportTitleEmpty);
    if (!description.trim()) throw new Error(DOMAIN_ERRORS.bugReportDescriptionEmpty);
    return new BugReport(title, description);
  }

  title(): string {
    return this._title;
  }

  description(): string {
    return this._description;
  }
}
