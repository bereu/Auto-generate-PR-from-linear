import { LinearClient } from "@linear/sdk";
import { logger } from "@/logger";

export interface RawLinearIssue {
  id: string;
  title: string;
  description: string | null;
  url: string;
  labels: string[];
}

export class LinearTransfer {
  private _client: LinearClient | null = null;

  private client(): LinearClient {
    if (!this._client) {
      const apiKey = process.env.LINEAR_API_KEY;
      if (!apiKey) throw new Error("LINEAR_API_KEY is not set");
      this._client = new LinearClient({ apiKey });
    }
    return this._client;
  }

  async fetchIssuesByLabelAndState(label: string, state: string): Promise<RawLinearIssue[]> {
    const connection = await this.client().issues({
      filter: {
        labels: { name: { eq: label } },
        state: { name: { eq: state } },
      },
    });

    return Promise.all(
      connection.nodes.map(async (issue) => {
        const labelsConnection = await issue.labels();
        return {
          id: issue.id,
          title: issue.title,
          description: issue.description ?? null,
          url: issue.url,
          labels: labelsConnection.nodes.map((l) => l.name),
        };
      }),
    );
  }

  async changeState(issueId: string, stateName: string): Promise<void> {
    const client = this.client();
    const issue = await client.issue(issueId);
    const team = await issue.team;
    if (!team) throw new Error(`Team not found for issue ${issueId}`);

    const statesConnection = await team.states();
    const state = statesConnection.nodes.find((s) => s.name === stateName);
    if (!state) throw new Error(`State "${stateName}" not found in team`);

    await client.updateIssue(issueId, { stateId: state.id });
    logger.info(`  📋 Linear: ${issueId} → "${stateName}"`);
  }

  async changeTitle(issueId: string, title: string): Promise<void> {
    await this.client().updateIssue(issueId, { title });
    logger.info(`  📋 Linear: ${issueId} title → "${title}"`);
  }
}
