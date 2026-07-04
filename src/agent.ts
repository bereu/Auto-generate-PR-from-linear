import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareWorktree, cleanupWorktree } from "@/sync-repos";
import { resolveRepo } from "@/linear";
import { IssueRepository } from "@/linear-webhook/repository/issue.repository";
import { LinearTransfer } from "@/transfer/linear.transfer";
import { GithubTransfer } from "@/transfer/github.transfer";
import { SuspendIssueCommand } from "@/linear-webhook/command/suspend-issue.command";
import { LinearIssue } from "@/domain/issue/linear-issue";
import { REPOS, MAX_TURNS, LOG_TRUNCATE_LENGTH } from "@/repos.config";
import { langfuse } from "@/util/langfuse";
import { logger } from "@/util/logger";
import {
  CLAUDE_MESSAGE_TYPES,
  CLAUDE_CONTENT_TYPES,
  CLAUDE_RESULT_SUBTYPES,
} from "@/constants/agent.constants";
import { AGENT_MESSAGES } from "@/constants/message/success/agent.message";
import {
  UnknownRepoError,
  MaxTurnsReachedError,
  ClaudeTerminatedError,
} from "@/constants/errors/business.error";

interface ClaudeResultMessage {
  type: "result";
  subtype?: string;
  usage?: { total_tokens?: number };
}

const LOG_TRUNCATE_START = 0;

const CLAUDE_ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Skill",
  "Bash(git add *)",
  "Bash(git commit *)",
  "Bash(git push *)",
  "Bash(gh pr create *)",
  "Bash(npm test)",
  "Bash(npm run lint)",
];

function createIssueRepository(): IssueRepository {
  return new IssueRepository(new LinearTransfer(), new GithubTransfer());
}

function createSuspendIssueCommand(issueRepository: IssueRepository): SuspendIssueCommand {
  return new SuspendIssueCommand(issueRepository);
}

// ----------------------------------------
// Helper: Build PR title and body from issue
// ----------------------------------------
function buildPrContent(issue: LinearIssue): { title: string; body: string } {
  const title = `feat: ${issue.title().value()} [${issue.id().value()}]`;
  const body = [
    `## Linear Issue`,
    issue.url(),
    ``,
    `## Description`,
    issue.description() ?? "No description",
    ``,
    `## Changes`,
    `Auto-implemented by Claude Code`,
  ].join("\n");
  return { title, body };
}

// ----------------------------------------
// Helper: Build prompt for Claude agent
// ----------------------------------------
async function buildAgentPrompt(
  issue: LinearIssue,
  workBranch: string,
  repoFullName: string,
  prContent: { title: string; body: string },
): Promise<string> {
  return langfuse.fetchTaskPrompt({
    title: issue.title().value(),
    description: issue.description() ?? "詳細なし",
    workBranch,
    repoFullName,
    prTitle: JSON.stringify(prContent.title),
    prBody: JSON.stringify(prContent.body),
  });
}

// ----------------------------------------
// Helper: Log tool block
// ----------------------------------------
function logToolBlock(
  issueId: string,
  block: { type: string; name?: string; input?: unknown },
): void {
  if (block.type === CLAUDE_CONTENT_TYPES.toolUse) {
    logger.info(
      `    🔧 [${issueId}] ${block.name}: ${JSON.stringify(block.input).slice(LOG_TRUNCATE_START, LOG_TRUNCATE_LENGTH)}`,
    );
  }
}

// ----------------------------------------
// Helper: Log Claude tool usage
// ----------------------------------------
function logClaudeToolUsage(issueId: string, msg: unknown): void {
  const msgObj = msg as {
    type: string;
    message?: { content: Array<{ type: string; name?: string; input?: unknown }> };
  };
  if (msgObj.type !== CLAUDE_MESSAGE_TYPES.assistant) return;
  if (!msgObj.message?.content) return;
  msgObj.message.content.forEach((block) => logToolBlock(issueId, block));
}

// ----------------------------------------
// Helper: Validate Claude result
// ----------------------------------------
async function validateClaudeResult(
  result: ClaudeResultMessage | null,
  issue: LinearIssue,
  suspendIssue: SuspendIssueCommand,
): Promise<void> {
  if (!result) throw new ClaudeTerminatedError(issue.id().value());
  if (result.subtype === CLAUDE_RESULT_SUBTYPES.errorMaxTurns) {
    await suspendIssue.suspend(issue);
    throw new MaxTurnsReachedError(issue.id().value());
  }
}

// ----------------------------------------
// Claude Agent SDK で実装 + push + PR 作成まで一括実行
//
// cwd = wtPath にすることで各リポジトリの
// .claude/CLAUDE.md / skills / hooks が自動ロードされる
// ----------------------------------------
async function runClaude(
  issue: LinearIssue,
  wtPath: string,
  workBranch: string,
  repoFullName: string,
  suspendIssue: SuspendIssueCommand,
): Promise<ClaudeResultMessage> {
  const prContent = buildPrContent(issue);
  const prompt = await buildAgentPrompt(issue, workBranch, repoFullName, prContent);

  let result: ClaudeResultMessage | null = null;

  for await (const msg of query({
    prompt,
    options: {
      cwd: wtPath,
      settingSources: ["project"],
      allowedTools: CLAUDE_ALLOWED_TOOLS,
      maxTurns: MAX_TURNS,
    },
  })) {
    logClaudeToolUsage(issue.id().value(), msg);
    if (msg.type === CLAUDE_MESSAGE_TYPES.result) {
      result = msg as ClaudeResultMessage;
    }
  }

  await validateClaudeResult(result, issue, suspendIssue);
  return result!;
}

// ----------------------------------------
// Helper: Resolve and validate repository
// ----------------------------------------
function resolveAndValidateRepo(issue: LinearIssue): { repoName: string; repoFull: string } {
  const issueId = issue.id().value();
  const repoNames = REPOS.map((r) => r.name);
  const repoName = resolveRepo(issue, repoNames);
  const repo = REPOS.find((r) => r.name === repoName);
  if (!repo) throw new UnknownRepoError(issueId, repoName ?? "");
  return { repoName, repoFull: `${repo.org}/${repo.name}` };
}

// ----------------------------------------
// Helper: Initialize Linear issue state
// ----------------------------------------
async function initializeLinearIssue(
  issueRepository: IssueRepository,
  issueId: string,
): Promise<void> {
  const isResume = await issueRepository.hasStartingComment(issueId).catch(() => false);
  const startComment = isResume ? AGENT_MESSAGES.agentResuming : AGENT_MESSAGES.agentStarting;
  await issueRepository.addComment(issueId, startComment).catch(() => {});
  await issueRepository.startImplementation(issueId);
}

// ----------------------------------------
// Helper: Handle Claude execution and completion
// ----------------------------------------
async function handleClaudeExecution(
  issue: LinearIssue,
  wtPath: string,
  workBranch: string,
  repoFull: string,
  issueRepository: IssueRepository,
  suspendIssue: SuspendIssueCommand,
): Promise<void> {
  const issueId = issue.id().value();
  const result = await runClaude(issue, wtPath, workBranch, repoFull, suspendIssue);
  const usage = result.usage;
  logger.info(`  🤖 [${issueId}] Claude完了 (${usage?.total_tokens ?? "-"} tokens)`);

  await issueRepository.markReadyForReview(issueId);
  const prUrl =
    (await issueRepository.fetchPrUrl(repoFull, workBranch)) ?? AGENT_MESSAGES.prNotFound;
  await issueRepository.addComment(issueId, AGENT_MESSAGES.agentComplete(prUrl)).catch(() => {});
  logger.info(`  ✅ [${issueId}] 完了`);
}

// ----------------------------------------
// Helper: Handle process errors
// ----------------------------------------
async function handleProcessIssueError(
  err: Error,
  issueId: string,
  issue: LinearIssue,
  issueRepository: IssueRepository,
  suspendIssue: SuspendIssueCommand,
): Promise<void> {
  const ctx = { error: err, properties: { issueId } };
  if (err instanceof MaxTurnsReachedError) {
    logger.warn(`  ⚠️  [${issueId}] Max turns reached: ${err.message}`, ctx);
  } else if (err instanceof ClaudeTerminatedError) {
    logger.warn(`  ⚠️  [${issueId}] Claude terminated: ${err.message}`, ctx);
    await suspendIssue.suspend(issue).catch(() => {});
    await issueRepository.addComment(issueId, AGENT_MESSAGES.agentTerminated).catch(() => {});
  } else if (err instanceof UnknownRepoError) {
    logger.warn(`  ⚠️  [${issueId}] Business error: ${err.message}`, ctx);
    await issueRepository
      .addComment(issueId, AGENT_MESSAGES.agentStopped(err.message))
      .catch(() => {});
  } else {
    logger.error(`  ❌ [${issueId}] System error: ${err.message}`, ctx);
    await issueRepository
      .addComment(issueId, AGENT_MESSAGES.agentFailed(err.message))
      .catch(() => {});
    await issueRepository.resetToPending(issueId).catch(() => {});
  }
}

// ----------------------------------------
// 1タスクの実行（worktree で完全独立）
// ----------------------------------------
export async function processIssue(issue: LinearIssue): Promise<void> {
  const issueId = issue.id().value();
  const issueRepository = createIssueRepository();
  const suspendIssue = createSuspendIssueCommand(issueRepository);
  let resolvedRepoName: string | undefined;

  try {
    const { repoName, repoFull } = resolveAndValidateRepo(issue);
    resolvedRepoName = repoName;

    logger.info(`\n▶ [${issueId}] ${issue.title().value()}`);
    logger.info(`  📦 ${repoFull}`);

    await initializeLinearIssue(issueRepository, issueId);
    const { wtPath, workBranch } = prepareWorktree(repoName, issueId);
    await handleClaudeExecution(issue, wtPath, workBranch, repoFull, issueRepository, suspendIssue);
  } catch (err) {
    await handleProcessIssueError(err as Error, issueId, issue, issueRepository, suspendIssue);
    throw err;
  } finally {
    if (resolvedRepoName) cleanupWorktree(resolvedRepoName, issueId);
  }
}
