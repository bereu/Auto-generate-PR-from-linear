import { REPO_NAME_PREFIX } from "@/repos.config.ts";
import { LinearIssue } from "@/issue/domain/linear-issue.ts";

export { LinearIssue };

// ----------------------------------------
// issue のテキストからリポジトリ名を推定
// ----------------------------------------
export function resolveRepo(issue: LinearIssue, repoNames: string[]): string {
  const text = `${issue.title().value()} ${issue.description() ?? ""}`.toLowerCase();

  for (const name of repoNames) {
    const short = name.replace(new RegExp(`^${REPO_NAME_PREFIX}`), "");
    if (text.includes(name) || text.includes(short)) return name;
  }

  return repoNames[0];
}
