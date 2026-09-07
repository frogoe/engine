# Skill installation and freshness

Read this reference when verifying skill freshness or diagnosing unexpected
behavior. **These commands are for the HUMAN operator** (docs, CI scripts,
README) — an agent inside a session never runs installers: package
installation is a user decision, and the agent's job is verification
(hash-pinned), not acquisition.

## Installation (operator, not agent)

Skills ship with the repo/package. The operator manages the global set:

```bash
npx skills add frogoe/engine            # all 5 via vercel-labs/skills (user-run)
npx skills add frogoe/engine --skill frogoe-registry  # one only (user-run)
npx skills add ./engine                 # from a sibling clone (user-run)
```

An agent that finds skills missing should surface what to install and stop —
never execute these itself.

Native plugin manifests `.claude-plugin/` (Claude), `.cursor-plugin/` (Cursor), `.codex-plugin/` (Codex) expose the same 5 skills to each store without `npx` — `skills/` is the distributable source, `.claude/skills` + `.agents/skills` are byte-identical mirrors for local dev (checked by `check:skill-mirror`).

## Diagnose and update

```bash
# check freshness (hash + files count)
node scripts/gen-skills-manifest.mjs --check
node scripts/verify-packed-manifests.mjs
bun run lint:skills
node scripts/check-skill-mirror.mjs

# refresh manifest after editing any skill
node scripts/gen-skills-manifest.mjs --write
```

- `gen-skills-manifest --check` exits non-zero when any skill's hash or file count is stale.
- `verify-packed-manifests` is the same check wrapped for `bun run verify` (CI).
- `lint:skills` guards against YAML frontmatter errors and dangerous inline patterns.
- `check:skill-mirror` asserts `.claude/skills` and `.agents/skills` stay byte-identical.

If the manifest is stale, the fix is always:

```bash
node scripts/gen-skills-manifest.mjs --write
```

Do not hand-edit `skills-manifest.json` — it is generated. The `hash` field is SHA256 over the entire bundle (SKILL.md + references/), CRLF-normalized, relative-path-aware — so equal content implies equal hash across platforms.

## CI behavior

`bun run verify` runs all four checks plus format/lint/types/tests/knip/registry. Any failure blocks merge. The manifest is the source of truth for `frogoe add` freshness — a stale hash means the registry block list may have drifted.
