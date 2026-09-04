# bundle — externals dissolve

`frogoe bundle` turns the folder into ONE self-contained HTML in `dist/`: import-map modules bundled (contract inlined), fonts fetched and embedded as base64 `@font-face`, local media as data URIs, provenance banner with sha256. Author-time externals are allowlisted (jsdelivr, esm.sh, unpkg, Google Fonts) and must be version-pinned — `@latest` and bare tags fail the bundle with `bundle/unpinned`; unknown hosts fail with `bundle/blocked-origin`. The artifact self-scans: if any remote URL survives, `bundle/leaked-remote` fails the build — nothing ships half-dissolved.

- `check` is deterministic/static; live output measures (rendered contrast) arrive with the sandbox layer. The declared-palette contrast check is the static floor.
- `bundle` requires network for CDN assets (allowlist plus pin plus sha256); offline games with only local assets bundle with zero fetches.
