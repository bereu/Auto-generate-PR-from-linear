import { Injectable } from "@nestjs/common";
import { Octokit } from "@octokit/rest";
import { logger } from "@/util/logger";
import { SYSTEM_ERRORS } from "@/constants/message/error/system.error";

const GITHUB_PR_FETCH_LIMIT = 1;
const REPO_PARTS_EXPECTED_LENGTH = 2;
const OWNER_INDEX = 0;
const REPO_INDEX = 1;
const FIRST_PR_INDEX = 0;

@Injectable()
export class GithubTransfer {
  private _octokit: Octokit | null = null;

  private client(): Octokit {
    if (!this._octokit) {
      const token = process.env.GITHUB_TOKEN;
      if (!token) throw new Error(SYSTEM_ERRORS.githubTokenNotSet);
      this._octokit = new Octokit({ auth: token });
    }
    return this._octokit;
  }

  private parseRepoFullName(repoFullName: string): [string, string] {
    const parts = repoFullName.split("/");
    if (parts.length !== REPO_PARTS_EXPECTED_LENGTH || !parts[OWNER_INDEX] || !parts[REPO_INDEX]) {
      throw new Error(SYSTEM_ERRORS.invalidRepoFullName);
    }
    return [parts[OWNER_INDEX], parts[REPO_INDEX]];
  }

  private async fetchPullRequests(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<Array<{ html_url: string }>> {
    const { data } = await this.client().pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: "open",
      per_page: GITHUB_PR_FETCH_LIMIT,
    });
    return data;
  }

  async fetchPrUrl(repoFullName: string, branch: string): Promise<string | null> {
    const [owner, repo] = this.parseRepoFullName(repoFullName);
    try {
      const pulls = await this.fetchPullRequests(owner, repo, branch);
      return pulls[FIRST_PR_INDEX]?.html_url ?? null;
    } catch (err) {
      logger.warn(`  ⚠️  Could not fetch PR URL for ${branch}: ${(err as Error).message}`);
      return null;
    }
  }
}
