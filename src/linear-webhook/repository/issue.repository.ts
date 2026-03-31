import { LinearTransfer } from "@/transfer/linear.transfer";
import { GithubTransfer } from "@/transfer/github.transfer";
import { LinearIssue } from "@/domain/issue/linear-issue";
import { LINEAR_LABEL, LINEAR_STATES } from "@/repos.config";
import { AGENT_MESSAGES } from "@/constants/message/success/agent.message";

export class IssueRepository {
  constructor(
    private readonly transfer: LinearTransfer,
    private readonly githubTransfer: GithubTransfer,
  ) {}

  async findAgentIssues(): Promise<LinearIssue[]> {
    const raw = await this.transfer.fetchIssuesByLabelAndState(LINEAR_LABEL, LINEAR_STATES.todo);
    return raw.map((r) => LinearIssue.reconstruct(r.id, r.title, r.description, r.url, r.labels));
  }

  async startImplementation(issueId: string): Promise<void> {
    await this.transfer.changeState(issueId, LINEAR_STATES.inProgress);
  }

  async markReadyForReview(issueId: string): Promise<void> {
    await this.transfer.changeState(issueId, LINEAR_STATES.inReview);
  }

  async suspend(issueId: string): Promise<void> {
    await this.transfer.changeState(issueId, LINEAR_STATES.suspended);
  }

  async resetToPending(issueId: string): Promise<void> {
    await this.transfer.changeState(issueId, LINEAR_STATES.todo);
  }

  async updateTitle(issueId: string, title: string): Promise<void> {
    await this.transfer.changeTitle(issueId, title);
  }

  async addComment(issueId: string, body: string): Promise<void> {
    await this.transfer.createComment(issueId, body);
  }

  async hasStartingComment(issueId: string): Promise<boolean> {
    const bodies = await this.transfer.fetchComments(issueId);
    return bodies.some((b) => b === AGENT_MESSAGES.agentStarting);
  }

  async fetchPrUrl(repoFullName: string, branch: string): Promise<string | null> {
    return this.githubTransfer.fetchPrUrl(repoFullName, branch);
  }
}
