import { DOMAIN_ERRORS } from "@/constants/message/error/domain.error";

const SUSPEND_PREFIX = "[SUSPEND]";

export class IssueTitle {
  private constructor(private readonly _value: string) {}

  static create(title: string): IssueTitle {
    if (!title) {
      throw new Error(DOMAIN_ERRORS.issueTitleEmpty);
    }
    return new IssueTitle(title);
  }

  value(): string {
    return this._value;
  }

  withSuspendPrefix(): IssueTitle {
    if (this._value.startsWith(SUSPEND_PREFIX)) {
      return this;
    }
    return new IssueTitle(`${SUSPEND_PREFIX} ${this._value}`);
  }
}
