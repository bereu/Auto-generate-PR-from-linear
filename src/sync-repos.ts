import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import {
  REPOS,
  DEFAULT_BRANCH,
  WORKSPACE,
  WORKTREE_BRANCH_PREFIX,
  type RepoConfig,
} from "@/repos.config";
import { logger } from "@/util/logger";

// ----------------------------------------
// 内部ユーティリティ
// ----------------------------------------
function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: "pipe",
    env: { ...process.env },
  }).trim();
}

function repoUrl(org: string, name: string): string {
  const token = process.env.GITHUB_TOKEN;
  return `https://x-access-token:${token}@github.com/${org}/${name}.git`;
}

function repoSshUrl(org: string, name: string): string {
  return `git@github.com:${org}/${name}.git`;
}

// ----------------------------------------
// 同期結果の型
// ----------------------------------------
export interface SyncResult {
  name: string;
  dest: string;
  branch: string;
  sha: string;
}

export interface SyncAllResult {
  synced: SyncResult[];
  failed: Array<{ name: string; error: string }>;
}

// ----------------------------------------
// 1リポジトリの同期
// メインリポジトリは fetch のみ。checkout は worktree 側で行う。
// ----------------------------------------
export async function syncRepo(repo: RepoConfig, branch = DEFAULT_BRANCH): Promise<SyncResult> {
  const { name, org } = repo;
  const dest = path.join(WORKSPACE, name);

  if (fs.existsSync(path.join(dest, ".git"))) {
    logger.info(`  ↻  ${name}: fetching...`);
    git(`remote set-url origin ${repoUrl(org, name)}`, dest);
    git(`fetch origin`, dest);
  } else {
    logger.info(`  ↓  ${name}: cloning...`);
    fs.mkdirSync(WORKSPACE, { recursive: true });
    git(`clone --branch ${branch} ${repoUrl(org, name)} ${dest}`, WORKSPACE);
  }

  // Switch remote to SSH so push and gh CLI operations use the SSH key
  git(`remote set-url origin ${repoSshUrl(org, name)}`, dest);

  const sha = git(`rev-parse --short origin/${branch}`, dest);
  logger.info(`  ✅ ${name} @ origin/${branch} (${sha})`);
  return { name, dest, branch, sha };
}

// ----------------------------------------
// 全リポジトリを並列同期（起動時に呼ぶ）
// ----------------------------------------
export async function syncAllRepos(): Promise<SyncAllResult> {
  logger.info("\n[sync] ======= repo sync start =======");
  fs.mkdirSync(WORKSPACE, { recursive: true });

  const results = await Promise.allSettled(REPOS.map((r) => syncRepo(r)));

  const synced: SyncResult[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      synced.push(r.value);
    } else {
      const name = REPOS[i].name;
      logger.error(`  ❌ ${name}: ${(r.reason as Error).message}`);
      failed.push({ name, error: (r.reason as Error).message });
    }
  });

  logger.info(`[sync] done — ${synced.length} ok, ${failed.length} failed`);
  logger.info("[sync] =====================================\n");

  if (synced.length === 0) {
    throw new Error("全リポジトリの同期に失敗しました。起動を中断します。");
  }

  return { synced, failed };
}

// ----------------------------------------
// worktree の作成結果の型
// ----------------------------------------
export interface WorktreeResult {
  wtPath: string;
  workBranch: string;
}

// ----------------------------------------
// worktree を使って作業ディレクトリを独立させる
//
// 構造:
//   /workspace/{repoName}/          ← メインリポジトリ（fetch のみ）
//   /workspace/{repoName}-wt-{id}/  ← タスクごとの独立した worktree
// ----------------------------------------
export function prepareWorktree(repoName: string, issueId: string): WorktreeResult {
  const repo = REPOS.find((r) => r.name === repoName);
  if (!repo) throw new Error(`Unknown repo: ${repoName}`);

  const mainRepo = path.join(WORKSPACE, repoName);
  const workBranch = `${WORKTREE_BRANCH_PREFIX}${issueId}`;
  const wtPath = path.join(WORKSPACE, `${repoName}-wt-${issueId}`);

  logger.info(`  ↻  ${repoName}: fetching origin...`);
  git(`fetch origin`, mainRepo);

  // 既存の worktree を削除
  try {
    git(`worktree remove --force ${wtPath}`, mainRepo);
  } catch (e) {
    logger.warn(`  ⚠️  existing worktree removal skipped: ${(e as Error).message}`);
  }
  if (fs.existsSync(wtPath)) fs.rmSync(wtPath, { recursive: true });

  // 既存の同名ブランチを削除
  try {
    git(`branch -D ${workBranch}`, mainRepo);
  } catch (e) {
    logger.warn(`  ⚠️  existing branch removal skipped: ${(e as Error).message}`);
  }

  // origin/master から作業ブランチを作り worktree として展開
  git(`worktree add -b ${workBranch} ${wtPath} origin/${DEFAULT_BRANCH}`, mainRepo);

  logger.info(`  🌿 ${repoName}: worktree ready → ${wtPath}`);
  return { wtPath, workBranch };
}

// ----------------------------------------
// タスク完了後に worktree を後片付け
// ----------------------------------------
export function cleanupWorktree(repoName: string, issueId: string): void {
  const mainRepo = path.join(WORKSPACE, repoName);
  const wtPath = path.join(WORKSPACE, `${repoName}-wt-${issueId}`);

  try {
    git(`worktree remove --force ${wtPath}`, mainRepo);
    logger.info(`  🧹 worktree removed: ${wtPath}`);
  } catch (e) {
    logger.warn(`  ⚠️  worktree cleanup failed: ${(e as Error).message}`);
  }
}
