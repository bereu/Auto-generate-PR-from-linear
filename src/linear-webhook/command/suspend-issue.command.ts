import { IssueRepository } from "@/linear-webhook/repository/issue.repository";
import { LinearIssue } from "@/domain/issue/linear-issue";

export class SuspendIssueCommand {
  constructor(private readonly issueRepository: IssueRepository) {}

  async suspend(issue: LinearIssue): Promise<void> {
    const suspendedTitle = issue.title().withSuspendPrefix().value();
    await this.issueRepository.updateTitle(issue.id().value(), suspendedTitle);
    await this.issueRepository.suspend(issue.id().value());
  }
}
