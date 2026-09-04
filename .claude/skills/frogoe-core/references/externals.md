# External libraries — author free, ship fat

Games may use CDN libraries and web fonts at author-time. The bundler dissolves them
into the single-file artifact (fetch → pin → hash → inline), so the shipped game
makes **zero runtime requests**.

## Author-time shapes

```html
<!-- index.html -->
<script type="importmap">
  {
    "imports": {
      "frogoe": "./.frogoe/contract.js",
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "gsap": "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/index.js"
    }
  }
</script>
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Fredoka:wght@600;700&display=swap"
/>
```

```js
// game.js — import by name; dev runs hit the CDN, bundling inlines
import * as THREE from "three";
```

## Rules that keep the artifact trustworthy

1. **Allowlist domains**: jsdelivr, esm.sh, unpkg, fonts.googleapis.com,
   fonts.gstatic.com. Anything else fails the bundle.
2. **Exact versions only** — `three@0.170.0` yes, `@latest` no. The pin is hashed at
   fetch; a changed upstream never silently enters an artifact.
3. **Verify runs on the bundled file** — what the sandbox checks is what ships:
   verified == played.
4. **Size awareness**: games over 3 MB get a bundle warning (not a reject) — feed
   caching stays sane.

## Why not fetch at runtime?

One artifact, one fetch, zero waterfalls. A feed game's first frame must be instant
and identical forever: no CDN rot, no region blocks, no supply-chain drift after
verification. Fat is fine; fragmented is a defect.
