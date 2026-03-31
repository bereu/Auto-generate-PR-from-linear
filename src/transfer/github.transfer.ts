import { Injectable } from "@nestjs/common";
import { Octokit } from "@octokit/rest";
import { logger } from "@/util/logger";
import { SYSTEM_ERRORS } from "@/constants/message/error/system.error";

const GITHUB_PR_FETCH_LIMIT = 1;

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

  async fetchPrUrl(repoFullName: string, branch: string): Promise<string | null> {
    const parts = repoFullName.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error(SYSTEM_ERRORS.invalidRepoFullName);
    }
    const [owner, repo] = parts;
    try {
      const { data } = await this.client().pulls.list({
        owner,
        repo,
        head: `${owner}:${branch}`,
        state: "open",
        per_page: GITHUB_PR_FETCH_LIMIT,
      });
      return data[0]?.html_url ?? null;
    } catch (err) {
      logger.warn(`  ⚠️  Could not fetch PR URL for ${branch}: ${(err as Error).message}`);
      return null;
    }
  }
}
