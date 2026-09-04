# Skill installation and freshness

Read this reference when installing or updating skills, diagnosing unexpected behavior, or running frogoe setup in CI.

Frogoe installs the core set eagerly and registry lazily.

- **Core set:** `/frogoe`, `frogoe-core`, `frogoe-creative`, `frogoe-cli`.
- **On-demand:** `frogoe-registry` (and future genre lenses) — installed when `frogoe add` is actually used.

## What `frogoe init` does

`frogoe init` scaffolds a game folder and does not touch global skills. Global skills are managed separately:

```bash
npx skills add frogoe/engine            # all 5 via vercel-labs/skills
npx skills add frogoe/engine --skill frogoe-registry  # one only
```

For local development from a clone:

```bash
npx skills add ./engine                 # from sibling clone
```

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
