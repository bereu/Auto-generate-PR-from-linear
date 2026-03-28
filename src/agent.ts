import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareWorktree, cleanupWorktree } from "@/sync-repos";
import { resolveRepo } from "@/linear";
import { IssueRepository } from "@/linear-webhook/repository/issue.repository";
import { LinearTransfer } from "@/transfer/linear.transfer";
import { SuspendIssueCommand } from "@/linear-webhook/command/suspend-issue.command";
import { LinearIssue } from "@/domain/issue/linear-issue";
import { REPOS, MAX_TURNS, LOG_TRUNCATE_LENGTH } from "@/repos.config";
import { loadPrompt } from "@/util/prompt-loader";
import { logger } from "@/logger";

interface ClaudeResultMessage {
  type: "result";
  subtype?: string;
  usage?: { total_tokens?: number };
}

function createIssueRepository(): IssueRepository {
  return new IssueRepository(new LinearTransfer());
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

  const prompt = loadPrompt("task", {
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
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "tool_use") {
          logger.info(
            `    🔧 [${issue.id().value()}] ${block.name}: ${JSON.stringify(block.input).slice(0, LOG_TRUNCATE_LENGTH)}`,
          );
        }
      }
    }

    if (msg.type === "result") {
      result = msg as ClaudeResultMessage;
    }
  }

  if (!result) throw new Error("Claude からレスポンスが返りませんでした");
  if (result.subtype === "error_max_turns") {
    await suspendIssue.suspend(issue);
    throw new Error("max_turns に達しました");
  }

  return result;
}

// ----------------------------------------
// 1タスクの実行（worktree で完全独立）
// ----------------------------------------
export async function processIssue(issue: LinearIssue): Promise<void> {
  const issueRepository = createIssueRepository();
  const repoNames = REPOS.map((r) => r.name);
  const repoName = resolveRepo(issue, repoNames);
  const repo = REPOS.find((r) => r.name === repoName);
  if (!repo) throw new Error(`Unknown repo: ${repoName}`);
  const repoFull = `${repo.org}/${repo.name}`;
  const issueId = issue.id().value();

  logger.info(`\n▶ [${issueId}] ${issue.title().value()}`);
  logger.info(`  📦 ${repoFull}`);

  // 1. Linear を "In Progress" に（重複実行防止）
  await issueRepository.startImplementation(issueId);

  // 2. worktree を作成（他タスクと独立した作業ディレクトリ）
  const { wtPath, workBranch } = prepareWorktree(repoName, issueId);

  try {
    // 3. Claude Code で実装 → push → PR 作成
    const suspendIssue = createSuspendIssueCommand(issueRepository);
    const result = await runClaude(issue, wtPath, workBranch, repoFull, suspendIssue);
    const usage = result.usage;
    logger.info(`  🤖 [${issueId}] Claude完了 (${usage?.total_tokens ?? "-"} tokens)`);

    // 4. Linear を "In Review" に
    await issueRepository.markReadyForReview(issueId);
    logger.info(`  ✅ [${issueId}] 完了`);
  } catch (err) {
    logger.error(`  ❌ [${issueId}] 失敗: ${(err as Error).message}`);
    await issueRepository.resetToPending(issueId).catch(() => {});
    throw err;
  } finally {
    // 5. 成功・失敗どちらでも worktree を掃除
    cleanupWorktree(repoName, issueId);
  }
}
