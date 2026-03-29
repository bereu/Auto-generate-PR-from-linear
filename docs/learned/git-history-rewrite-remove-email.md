# What I Learned: Rewriting Git History to Remove a Hardcoded Email

**Date:** 2026-03-28

## What I Learned This Session

### 1. Real email hardcoded in Dockerfile gets baked into every commit

The Dockerfile had:

```dockerfile
RUN git config --global user.email "claude-agent@jitera.com" \
 && git config --global user.name  "Claude Agent"
```

This is not just a runtime concern — the email exists in plaintext in the git object for every commit since it was introduced, and is visible to anyone with repo access (or if the repo is ever made public).

**Rule:** Any email in a Dockerfile `git config` line must be a placeholder (e.g., `claude-agent@example.com`). Real organizational emails must not appear in source files.

### 2. To erase a string from all git history, `git filter-branch` or `git-filter-repo` is required

A normal `git commit` that fixes the file only removes it from the tip. The old commits still contain the old content. The complete removal process was:

1. Fix the file in a new commit (`git commit`)
2. Rewrite all ancestor commits with `git filter-branch` (or `git-filter-repo`) to replace the string in every tree
3. Force-push the rewritten branch: `git push --force`

This rewrites all 12 commits on the branch, changing their SHAs. Anyone else with a local copy of the branch will have diverged history after this.

**Key point:** Force-pushing history rewrites is destructive to collaborators. It should only be done on feature branches, never on `main`/`master` without team coordination.

### 3. `git-filter-repo` is faster and safer than `git filter-branch`

`git filter-branch` is deprecated and slow on large histories. `git-filter-repo` (a separate install: `pip install git-filter-repo` or `brew install git-filter-repo`) is the recommended replacement and handles blob rewriting much faster.

Typical command to replace a string in all file contents across history:

```bash
git filter-repo --replace-text <(echo 'claude-agent@jitera.com==>claude-agent@example.com')
```

### 4. After a history rewrite, local stashes and refs are orphaned

After `filter-branch` or `filter-repo`, `git stash list` may show entries pointing to commits that no longer exist in the rewritten history. These stash refs are safe to drop, but they will appear in `git log --all` as dangling commits until `git gc --prune=now` is run.

## What a New Team Member Should Know

- The Dockerfile intentionally uses `claude-agent@example.com` as the git identity. Do not change this to a real email — the Docker container only needs a valid format for `git commit` to work inside the build; the value itself doesn't matter.
- If a real email or secret is ever committed, the fix is a two-step process: (1) remove from the file and commit, (2) rewrite history with `git-filter-repo` and force-push. Step 1 alone is **not** sufficient.

## Docs & Info That Would Speed Things Up Next Time

- `Dockerfile` line 15 — the placeholder email. This is where the value lives; check here before changing.
- `git-filter-repo` docs: `git filter-repo --help` — especially `--replace-text` for string substitution across blobs.
- Before force-pushing a rewritten branch, confirm no other developer has checked it out (`git branch -r` and team check) to avoid orphaning their local work.
