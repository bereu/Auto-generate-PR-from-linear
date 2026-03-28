const SUSPEND_PREFIX = "[SUSPEND]";

export class IssueTitle {
  private constructor(private readonly _value: string) {}

  static create(title: string): IssueTitle {
    if (!title) {
      throw new Error("IssueTitle must be a non-empty string");
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
