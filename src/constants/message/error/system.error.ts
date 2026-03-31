export const SYSTEM_ERRORS = {
  syncAllFailed: "全リポジトリの同期に失敗しました。起動を中断します。",
  linearApiKeyNotSet: "LINEAR_API_KEY is not set",
  noLinearTeamFound: "No Linear team found in workspace",
  linearIssueCreationFailed: "Linear issue creation failed",
  teamNotFound: "Team not found",
  stateNotFound: "State not found",
  linearCommentFailed: "Linear comment creation failed",
  unknownRepo: "Unknown repo",
  githubTokenNotSet: "GITHUB_TOKEN is not set",
  invalidRepoFullName: "repoFullName must be in 'owner/repo' format",
} as const;
