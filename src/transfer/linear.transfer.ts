import { Injectable } from "@nestjs/common";
import { LinearClient } from "@linear/sdk";
import { logger } from "@/util/logger";
import { SYSTEM_ERRORS } from "@/constants/message/error/system.error";

export interface RawLinearIssue {
  id: string;
  title: string;
  description: string | null;
  url: string;
  labels: string[];
}

@Injectable()
export class LinearTransfer {
  private _client: LinearClient | null = null;

  private client(): LinearClient {
    if (!this._client) {
      const apiKey = process.env.LINEAR_API_KEY;
      if (!apiKey) throw new Error(SYSTEM_ERRORS.linearApiKeyNotSet);
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
    if (!team) throw new Error(`${SYSTEM_ERRORS.teamNotFound} for issue ${issueId}`);

    const statesConnection = await team.states();
    const state = statesConnection.nodes.find((s) => s.name === stateName);
    if (!state) throw new Error(`${SYSTEM_ERRORS.stateNotFound} "${stateName}" not found in team`);

    await client.updateIssue(issueId, { stateId: state.id });
    logger.info(`  📋 Linear: ${issueId} → "${stateName}"`);
  }

  async createComment(issueId: string, body: string): Promise<void> {
    const result = await this.client().createComment({ issueId, body });
    if (!result.success) throw new Error(SYSTEM_ERRORS.linearCommentFailed);
    logger.info(`  📋 Linear: comment added to ${issueId}`);
  }

  async changeTitle(issueId: string, title: string): Promise<void> {
    await this.client().updateIssue(issueId, { title });
    logger.info(`  📋 Linear: ${issueId} title → "${title}"`);
  }

  async createIssue(params: {
    title: string;
    description: string;
    labelNames: string[];
    stateName?: string;
  }): Promise<{ url: string }> {
    const client = this.client();
    const teamsConnection = await client.teams();
    const team = teamsConnection.nodes[0];
    if (!team) throw new Error(SYSTEM_ERRORS.noLinearTeamFound);

    const labelsConnection = await team.labels();
    const labelIds = labelsConnection.nodes
      .filter((l) => params.labelNames.includes(l.name))
      .map((l) => l.id);

    let stateId: string | undefined;
    if (params.stateName) {
      const statesConnection = await team.states();
      const state = statesConnection.nodes.find((s) => s.name === params.stateName);
      if (!state)
        throw new Error(`${SYSTEM_ERRORS.stateNotFound} "${params.stateName}" not found in team`);
      stateId = state.id;
    }

    const result = await client.createIssue({
      teamId: team.id,
      title: params.title,
      description: params.description,
      labelIds,
      ...(stateId ? { stateId } : {}),
    });
    const issue = await result.issue;
    if (!issue) throw new Error(SYSTEM_ERRORS.linearIssueCreationFailed);

    logger.info(`  📋 Linear: created issue "${params.title}"`);
    return { url: issue.url };
  }
}
