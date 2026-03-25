import { query } from "@anthropic-ai/claude-agent-sdk";
import { prepareWorktree, cleanupWorktree } from "@/sync-repos.js";
import { updateIssueState, updateIssueTitle, resolveRepo, type LinearIssue } from "@/linear.js";
import { REPOS, MAX_TURNS, LOG_TRUNCATE_LENGTH, LINEAR_STATES } from "@/repos.config.js";
import { loadPrompt } from "@/prompt-loader.js";
import { logger } from "@/logger.js";

interface ClaudeResultMessage {
  type: "result";
  subtype?: string;
  usage?: { total_tokens?: number };
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
): Promise<ClaudeResultMessage> {
  const prTitle = `feat: ${issue.title} [${issue.id}]`;
  const prBody = [
    `## Linear Issue`,
    issue.url,
    ``,
    `## Description`,
    issue.description ?? "No description",
    ``,
    `## Changes`,
    `Auto-implemented by Claude Code`,
  ].join("\n");

  const prompt = loadPrompt("task", {
    title: issue.title,
    description: issue.description ?? "詳細なし",
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
            `    🔧 [${issue.id}] ${block.name}: ${JSON.stringify(block.input).slice(0, LOG_TRUNCATE_LENGTH)}`,
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
    const suspendedTitle = issue.title.startsWith("[SUSPEND]")
      ? issue.title
      : `[SUSPEND] ${issue.title}`;
    await updateIssueTitle(issue.id, suspendedTitle);
    await updateIssueState(issue.id, LINEAR_STATES.suspended);
    throw new Error("max_turns に達しました");
  }

  return result;
}

// ----------------------------------------
// 1タスクの実行（worktree で完全独立）
// ----------------------------------------
export async function processIssue(issue: LinearIssue): Promise<void> {
  const repoNames = REPOS.map((r) => r.name);
  const repoName = resolveRepo(issue, repoNames);
  const repo = REPOS.find((r) => r.name === repoName);
  if (!repo) throw new Error(`Unknown repo: ${repoName}`);
  const repoFull = `${repo.org}/${repo.name}`;

  logger.info(`\n▶ [${issue.id}] ${issue.title}`);
  logger.info(`  📦 ${repoFull}`);

  // 1. Linear を "In Progress" に（重複実行防止）
  await updateIssueState(issue.id, LINEAR_STATES.inProgress);

  // 2. worktree を作成（他タスクと独立した作業ディレクトリ）
  const { wtPath, workBranch } = prepareWorktree(repoName, issue.id);

  try {
    // 3. Claude Code で実装 → push → PR 作成
    const result = await runClaude(issue, wtPath, workBranch, repoFull);
    const usage = result.usage;
    logger.info(`  🤖 [${issue.id}] Claude完了 (${usage?.total_tokens ?? "-"} tokens)`);

    // 4. Linear を "In Review" に
    await updateIssueState(issue.id, LINEAR_STATES.inReview);
    logger.info(`  ✅ [${issue.id}] 完了`);
  } catch (err) {
    logger.error(`  ❌ [${issue.id}] 失敗: ${(err as Error).message}`);
    await updateIssueState(issue.id, LINEAR_STATES.todo).catch(() => {});
    throw err;
  } finally {
    // 5. 成功・失敗どちらでも worktree を掃除
    cleanupWorktree(repoName, issue.id);
  }
}
