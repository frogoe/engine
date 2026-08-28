# Bundler spec — "externals dissolve"

Author free, ship fat. The bundler turns a game FOLDER into ONE self-contained
HTML file with zero runtime requests.

## Pipeline

```
folder in ──► resolve ──► fetch ──► pin+hash ──► inline ──► artifact out
              import map   allowlist   exact ver    all CSS/JS/assets
              + local refs only        + sha256     + font-face base64
```

1. **Resolve** — walk `index.html`: import map entries, `<script src>`,
   `<link rel=stylesheet>`, `<img src>`, `<audio src>`. Local paths stay
   relative to the folder; remote URLs go to the allowlist gate.
2. **Allowlist** — jsdelivr, esm.sh, unpkg, fonts.googleapis.com,
   fonts.gstatic.com. Anything else: bundle fails with a finding
   (`bundle/blocked-origin`).
3. **Pin + hash** — exact versions required (`three@0.170.0`; `@latest` is a
   lint finding). Each fetched asset is sha256-recorded into the artifact
   header comment for reproducibility.
4. **Inline** — JS as `<script type="module">` bodies (imports rewritten to
   blob-order), CSS into `<style>`, fonts to `@font-face` base64 (woff2 only),
   images/audio to data URIs.
5. **Verify** — the sandbox runs the BUNDLED artifact: what is verified is
   what ships.

## Output contract

```
dist/index.html — single file, content-addressed name (sha of body),
                  header comment: contract version + asset hashes
```

## Budget

Warn > 3 MB (`bundle/size`), never reject. Feed caching handles content-addressed
artifacts of any sane size.

## Not in scope (v0)

Code minification (agents write readable; the artifact is cached once),
tree-shaking, multiple HTML entries per game.
