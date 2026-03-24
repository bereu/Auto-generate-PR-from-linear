export interface RepoConfig {
  name: string;
  org: string;
}

export const REPOS: RepoConfig[] = [{ name: "harness-enginearing-todo-test", org: "bereu" }];

export const DEFAULT_BRANCH = "master";
export const WORKSPACE = "/app/workspace";
export const POLL_INTERVAL = 60 * 1000; // 1分
export const MAX_TURNS = 20;
export const LOG_TRUNCATE_LENGTH = 80;
export const WORKTREE_BRANCH_PREFIX = "claude/issue-";
export const REPO_NAME_PREFIX = "harness-";

export const LINEAR_LABEL = "agent";
export const LINEAR_STATES = {
  todo: "Todo",
  inProgress: "In Progress",
  inReview: "In Review",
} as const;
