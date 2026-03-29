# What I Learned: linear-cli Reads API Key from .env — Never Inline It

**Date:** 2026-03-27

## What I Learned This Session

### `linear-cli` picks up `LINEAR_API_KEY` from the loaded environment

When `dev:local` or any dev script is run with `--env-file=.env`, the `LINEAR_API_KEY` is already in the shell environment. Calling `linear-cli` (or any other CLI tool that reads this key) works without prefixing the command:

**Wrong:**

```bash
LINEAR_API_KEY=lin_api_xxx linear-cli api query '{ webhooks { ... } }'
```

**Correct:**

```bash
linear-cli api query '{ webhooks { ... } }'
```

The `.env` file is authoritative. Inlining the key:

1. Exposes the secret in shell history and conversation logs.
2. Duplicates a value that should have a single source of truth.
3. Signals that you didn't check whether the env was already loaded.

### The user will reject any command that inlines a key from `.env`

This project keeps credentials in `.env` only. If you need a key for a CLI call, verify it is already loaded from the environment — don't hardcode it in the command.

## What a New Team Member Should Know

- Before running any CLI tool that needs `LINEAR_API_KEY`, verify the env is loaded (i.e., you started via `vp exec tsx --env-file=.env` or sourced `.env`).
- Never include `KEY=value` prefixes for keys that come from `.env` in your commands or scripts.
- If a CLI tool is not picking up the key, the fix is to check how `.env` is loaded — not to hardcode the key.

## Docs & Info That Would Speed Things Up Next Time

- `.env` — the single source of all credentials in this project.
- `package.json` scripts — all use `vp exec tsx --env-file=.env ...`, which injects the env before process start.
