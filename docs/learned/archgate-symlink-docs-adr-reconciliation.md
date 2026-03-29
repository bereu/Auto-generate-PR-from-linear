# What I Learned: Archgate Symlink and docs/adr Reconciliation

**Date:** 2026-03-27

## What I Learned This Session

### `.archgate/adrs` can be a symlink — archgate accepts it

The previous session documented that archgate uses `.archgate/adrs/` as the canonical ADR path. However, if the project wants to keep `docs/adr/` as the human-facing, git-tracked location, you can make `.archgate/adrs` a **symlink** pointing to `../docs/adr`:

```bash
ln -s ../docs/adr .archgate/adrs
```

After this, archgate reads/writes ADRs through the symlink, and `docs/adr/` remains the actual storage location. This lets both paths work simultaneously without file duplication.

### This contradicts what `archgate-init-and-adr-migration.md` says

The earlier learned doc states: "do not create ADRs in `docs/adr/`". That was written assuming archgate's `.archgate/adrs/` would be a real directory. With the symlink approach, `docs/adr/` **is** the right place — it's where the real files live.

### File migration order matters when setting up the symlink

The correct order is:

1. Remove or ensure `.archgate/adrs` does not exist as a real directory.
2. Move any existing archgate-generated ADRs (e.g., `GEN-001-example.md`) into `docs/adr/`.
3. Create the symlink: `ln -s ../docs/adr .archgate/adrs`.

If you create the symlink first while `.archgate/adrs/` already exists as a real directory, `ln -s` will silently create the symlink inside that directory instead of replacing it.

## What a New Team Member Should Know

- `docs/adr/` is the source of truth for ADRs. `.archgate/adrs` is just a symlink to it.
- Add new ADRs directly to `docs/adr/` — archgate will find them via the symlink.
- Git tracks files under `docs/adr/`, so ADR history stays there.
- `git status` shows `.archgate/` as untracked; this is expected since `.archgate/` (excluding the symlink target) is intentionally not fully committed.

## Docs & Info That Would Speed Things Up Next Time

- Previous learned doc (now partially superseded): `docs/learned/archgate-init-and-adr-migration.md`
- Archgate frontmatter format reference: `.archgate/adrs/GEN-001-example.md`
- Check symlink with `ls -la .archgate/adrs` before trusting that archgate is reading from `docs/adr/`
