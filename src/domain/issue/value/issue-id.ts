import { DOMAIN_ERRORS } from "@/constants/message/error/domain.error";

export class IssueId {
  private constructor(private readonly _value: string) {}

  static of(id: string): IssueId {
    if (!id) {
      throw new Error(DOMAIN_ERRORS.issueIdEmpty);
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
