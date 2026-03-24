import { LinearClient } from "@linear/sdk";
import { logger } from "@/logger.js";
import { LINEAR_LABEL, LINEAR_STATES, REPO_NAME_PREFIX } from "@/repos.config.js";

let _client: LinearClient | null = null;

function getClient(): LinearClient {
  if (!_client) {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) throw new Error("LINEAR_API_KEY is not set");
    _client = new LinearClient({ apiKey });
  }
  return _client;
}

// ----------------------------------------
// 型定義
// ----------------------------------------
export interface LinearIssue {
  id: string;
  title: string;
  description: string | null;
  url: string;
  labels: { nodes: Array<{ name: string }> };
}

// ----------------------------------------
// "agent" ラベル + "Todo" の issue を取得
// ----------------------------------------
export async function fetchAgentIssues(): Promise<LinearIssue[]> {
  const connection = await getClient().issues({
    filter: {
      labels: { name: { eq: LINEAR_LABEL } },
      state: { name: { eq: LINEAR_STATES.todo } },
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
        labels: { nodes: labelsConnection.nodes.map((l) => ({ name: l.name })) },
      };
    }),
  );
}

// ----------------------------------------
// ステータスを名前で更新
// ----------------------------------------
export async function updateIssueState(issueId: string, stateName: string): Promise<void> {
  const client = getClient();
  const issue = await client.issue(issueId);
  const team = await issue.team;
  if (!team) throw new Error(`Team not found for issue ${issueId}`);

  const statesConnection = await team.states();
  const state = statesConnection.nodes.find((s) => s.name === stateName);
  if (!state) throw new Error(`State "${stateName}" not found in team`);

  await client.updateIssue(issueId, { stateId: state.id });

  logger.info(`  📋 Linear: ${issueId} → "${stateName}"`);
}

// ----------------------------------------
// issue のテキストからリポジトリ名を推定
// ----------------------------------------
export function resolveRepo(issue: LinearIssue, repoNames: string[]): string {
  const text = `${issue.title} ${issue.description ?? ""}`.toLowerCase();

  for (const name of repoNames) {
    const short = name.replace(new RegExp(`^${REPO_NAME_PREFIX}`), "");
    if (text.includes(name) || text.includes(short)) return name;
  }

  return repoNames[0];
}
