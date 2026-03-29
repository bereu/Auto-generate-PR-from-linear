export class BugReport {
  private constructor(
    private readonly _title: string,
    private readonly _description: string,
  ) {}

  static create(title: string, description: string): BugReport {
    if (!title.trim()) throw new Error("BugReport title cannot be empty");
    if (!description.trim()) throw new Error("BugReport description cannot be empty");
    return new BugReport(title, description);
  }

  title(): string {
    return this._title;
  }

  description(): string {
    return this._description;
  }
}
