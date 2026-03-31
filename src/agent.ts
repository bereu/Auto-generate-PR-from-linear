import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareWorktree, cleanupWorktree } from "@/sync-repos";
import { resolveRepo } from "@/linear";
import { IssueRepository } from "@/linear-webhook/repository/issue.repository";
import { LinearTransfer } from "@/transfer/linear.transfer";
import { GithubTransfer } from "@/transfer/github.transfer";
import { SuspendIssueCommand } from "@/linear-webhook/command/suspend-issue.command";
import { LinearIssue } from "@/domain/issue/linear-issue";
import { REPOS, MAX_TURNS, LOG_TRUNCATE_LENGTH } from "@/repos.config";
import { promptLoader } from "@/util/prompt-loader";
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

function createIssueRepository(): IssueRepository {
  return new IssueRepository(new LinearTransfer(), new GithubTransfer());
}

function createSuspendIssueCommand(issueRepository: IssueRepository): SuspendIssueCommand {
  return new SuspendIssueCommand(issueRepository);
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
  const prTitle = `feat: ${issue.title().value()} [${issue.id().value()}]`;
  const prBody = [
    `## Linear Issue`,
    issue.url(),
    ``,
    `## Description`,
    issue.description() ?? "No description",
    ``,
    `## Changes`,
    `Auto-implemented by Claude Code`,
  ].join("\n");

  const prompt = promptLoader.load("task", {
    title: issue.title().value(),
    description: issue.description() ?? "詳細なし",
    workBranch,
    repoFullName,
    prTitle: JSON.stringify(prTitle),
    prBody: JSON.stringify(prBody),
  });

  let result: ClaudeResultMessage | null = null;

  for await (const msg of query({
    prompt,
    options: {
      cwd: wtPath,

      // wtPath/.claude/ 以下の CLAUDE.md / rules / skills / hooks を自動ロード
      settingSources: ["project"],

      allowedTools: [
        "Read",
        "Write",
        "Skill",
        "Bash(git add *)",
        "Bash(git commit *)",
        "Bash(git push *)",
        "Bash(gh pr create *)",
        "Bash(npm test)",
        "Bash(npm run lint)",
      ],

      maxTurns: MAX_TURNS,
    },
  })) {
    // ツール使用状況をリアルタイムでログ出力
    if (msg.type === CLAUDE_MESSAGE_TYPES.assistant) {
      for (const block of msg.message.content) {
        if (block.type === CLAUDE_CONTENT_TYPES.toolUse) {
          logger.info(
            `    🔧 [${issue.id().value()}] ${block.name}: ${JSON.stringify(block.input).slice(0, LOG_TRUNCATE_LENGTH)}`,
          );
        }
      }
    }

    if (msg.type === CLAUDE_MESSAGE_TYPES.result) {
      result = msg as ClaudeResultMessage;
    }
  }

  if (!result) throw new ClaudeTerminatedError(issue.id().value());
  if (result.subtype === CLAUDE_RESULT_SUBTYPES.errorMaxTurns) {
    await suspendIssue.suspend(issue);
    throw new MaxTurnsReachedError(issue.id().value());
  }

  return result;
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
    const repoNames = REPOS.map((r) => r.name);
    const repoName = resolveRepo(issue, repoNames);
    const repo = REPOS.find((r) => r.name === repoName);
    if (!repo) throw new UnknownRepoError(issueId, repoName ?? "");
    resolvedRepoName = repoName;
    const repoFull = `${repo.org}/${repo.name}`;

    logger.info(`\n▶ [${issueId}] ${issue.title().value()}`);
    logger.info(`  📦 ${repoFull}`);

    // 1. Linear にコメントを追加し、"In Progress" に（重複実行防止）
    const isResume = await issueRepository.hasStartingComment(issueId).catch(() => false);
    const startComment = isResume ? AGENT_MESSAGES.agentResuming : AGENT_MESSAGES.agentStarting;
    await issueRepository.addComment(issueId, startComment).catch(() => {});
    await issueRepository.startImplementation(issueId);

    // 2. worktree を作成（他タスクと独立した作業ディレクトリ）
    const { wtPath, workBranch } = prepareWorktree(repoName, issueId);

    // 3. Claude Code で実装 → push → PR 作成
    const result = await runClaude(issue, wtPath, workBranch, repoFull, suspendIssue);
    const usage = result.usage;
    logger.info(`  🤖 [${issueId}] Claude完了 (${usage?.total_tokens ?? "-"} tokens)`);

    // 4. Linear を "In Review" に
    await issueRepository.markReadyForReview(issueId);
    const prUrl =
      (await issueRepository.fetchPrUrl(repoFull, workBranch)) ?? AGENT_MESSAGES.prNotFound;
    await issueRepository.addComment(issueId, AGENT_MESSAGES.agentComplete(prUrl)).catch(() => {});
    logger.info(`  ✅ [${issueId}] 完了`);
  } catch (err) {
    if (err instanceof MaxTurnsReachedError) {
      // Already suspended by SuspendIssueCommand — do NOT reset to pending
      logger.warn(`  ⚠️  [${issueId}] Max turns reached: ${err.message}`);
    } else if (err instanceof ClaudeTerminatedError) {
      // Claude exited mid-run (cost limit, process kill, SDK abort)
      // Suspend so it doesn't re-trigger and hit the same limit again
      logger.warn(`  ⚠️  [${issueId}] Claude terminated: ${err.message}`);
      await suspendIssue.suspend(issue).catch(() => {});
      await issueRepository.addComment(issueId, AGENT_MESSAGES.agentTerminated).catch(() => {});
    } else if (err instanceof UnknownRepoError) {
      // Misconfiguration — resetting to pending causes infinite loop
      logger.warn(`  ⚠️  [${issueId}] Business error: ${err.message}`);
      await issueRepository
        .addComment(issueId, AGENT_MESSAGES.agentStopped(err.message))
        .catch(() => {});
    } else {
      // System error — comment to notify, then reset to pending so human can retry
      logger.error(`  ❌ [${issueId}] System error: ${(err as Error).message}`);
      await issueRepository
        .addComment(issueId, AGENT_MESSAGES.agentFailed((err as Error).message))
        .catch(() => {});
      await issueRepository.resetToPending(issueId).catch(() => {});
    }
    throw err;
  } finally {
    // 5. 成功・失敗どちらでも worktree を掃除（worktree が作成済みの場合のみ）
    if (resolvedRepoName) cleanupWorktree(resolvedRepoName, issueId);
  }
}
