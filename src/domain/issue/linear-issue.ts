import { IssueId } from "@/domain/issue/value/issue-id";
import { IssueTitle } from "@/domain/issue/value/issue-title";

export class LinearIssue {
  private constructor(
    private readonly _id: IssueId,
    private readonly _title: IssueTitle,
    private readonly _description: string | null,
    private readonly _url: string,
    private readonly _labels: string[],
  ) {}

  static reconstruct(
    id: string,
    title: string,
    description: string | null,
    url: string,
    labels: string[],
  ): LinearIssue {
    return new LinearIssue(IssueId.of(id), IssueTitle.create(title), description, url, labels);
  }

  id(): IssueId {
    return this._id;
  }

  title(): IssueTitle {
    return this._title;
  }

  description(): string | null {
    return this._description;
  }

  url(): string {
    return this._url;
  }

  labels(): string[] {
    return [...this._labels];
  }

  hasLabel(label: string): boolean {
    return this._labels.includes(label);
  }

  isAgentIssue(agentLabel: string): boolean {
    return this.hasLabel(agentLabel);
  }
}
