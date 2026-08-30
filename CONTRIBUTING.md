# Contributing to frogoe

frogoe is built for agents and humans who ship small, perfect games.

## The one rule

The platform (`packages/contract`) has **zero visual opinion**. If a change
makes it draw, style, or sound like anything, that change is wrong — move
it to the registry (a themeable block) or to skills (knowledge).

## Development

```bash
bun install          # NOT pnpm — do not create pnpm-lock.yaml
bun run verify       # format + lint + types + tests + knip + registry
```

`verify` must be green. The lefthook pre-commit runs part of it; the CI
runs all of it plus the live sandbox against real headless Chrome.

## Commits (this is the release system)

Conventional commits are **enforced** by commitlint — and they are the
entire release discipline:

| Commit                                     | Effect when the release PR merges |
| ------------------------------------------ | --------------------------------- |
| `feat: …`                                  | minor bump (0.X.0)                |
| `fix: …`                                   | patch bump (0.1.X)                |
| `feat!:` / `BREAKING CHANGE:`              | major bump                        |
| `docs:` / `chore:` / `test:` / `refactor:` | no bump                           |

Nobody tracks versions by hand. The release-please bot reads these
commits and maintains a running **release PR** (version bump +
CHANGELOG). When it looks ready, merge it — that merge creates the tag,
and the tag publishes to npm automatically (provenance-signed, no
tokens).

## Publishing

Publishes happen only from CI, only from tags:

- **Stable `vX.Y.Z`** — created by merging the release PR. The workflow
  rejects stable tags that point outside `main`.
- **Prerelease `vX.Y.Z-beta.1`** — push such a tag by hand; it publishes
  under the matching npm dist-tag (`beta`), never `latest`.

npm publishing uses **trusted publishing** (OIDC): there is no
`NPM_TOKEN` anywhere. The binding lives on npmjs.com → package settings
→ trusted publisher (repo `frogoe/engine`, workflow `release.yml`,
environment `npm-publish`).

### One-time bootstrap (first release)

Trusted publishing can only be configured for a package that already
exists, so the very first publish is manual, once:

1. `npm login` (the account that will own `frogoe`)
2. `cd packages/cli && npm publish --access public`
3. On npmjs.com → package `frogoe` → settings → **trusted publisher**:
   repository `frogoe/engine`, workflow `release.yml`, environment
   `npm-publish`
4. In GitHub → repo settings → **Environments** → create `npm-publish`
   (add required reviewers later if you want an approval gate)
5. `git tag v0.1.0 && git push origin v0.1.0` — the workflow runs, sees
   `frogoe@0.1.0` already on npm, skips the publish, and verifies the
   artifact: the whole pipeline is validated with zero risk

From then on: merge the release PR the bot maintains, and everything
after that is automated.

## Adding a registry block

Copy an existing block dir (`score-card` is smallest), keep bindings in
`registry-item.json` matching the markup, ship a `demo.html`, and run
`bun run registry:check`. `frogoe add <name>` must install cleanly and
idempotently.
