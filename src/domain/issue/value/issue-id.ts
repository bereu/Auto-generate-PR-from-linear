export class IssueId {
  private constructor(private readonly _value: string) {}

  static of(id: string): IssueId {
    if (!id) {
      throw new Error("IssueId must be a non-empty string");
    }
    return new IssueId(id);
  }

  value(): string {
    return this._value;
  }

  equals(other: IssueId): boolean {
    return this._value === other._value;
  }
}
