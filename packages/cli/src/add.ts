/** frogoe add <block> — install a registry HUD block into the game.
 *  Smart install: extracts <style> + markup from the block file, injects
 *  both into index.html (style into <head>, markup into .hud layer).
 *  Idempotent: re-running replaces the previous install cleanly. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { registryRoot } from "./init.ts";

export interface AddResult {
  bindings: string[];
  block: string;
  /** markup + styles injected into index.html (true) or copied only (false) */
  injected: boolean;
  placement: string;
}

interface RegistryItem {
  bindings?: string[];
  files: Array<{ path: string; type: string }>;
  name: string;
  placement?: string;
  pos?: string;
}

/** Extract CSS and markup from a block file. Linear string ops — the old
 *  `</style>\s*([\s\S]*)$` regex overlapped two unbounded quantifiers and
 *  backtracked quadratically (CodeQL: js/polynomial-redos); the `\s*` was
 *  redundant anyway because the caller trims.
 *
 *  Style handling is placement-critical (the shipped bug: blocks whose
 *  copy region carries its own <style> rode INTO .hud, where the text
 *  nodes trip the outline/collapse gates): every <style> inside the copy
 *  region is hoisted to <head> css, and NONE remain in the markup. */
export const parseBlock = (source: string): { css: string | null; markup: string } => {
  const fromMarker = source.indexOf("COPY FROM HERE");
  const toMarker = source.indexOf("COPY TO HERE");
  let region: string;
  if (fromMarker !== -1 && toMarker !== -1 && toMarker > fromMarker) {
    const afterFrom = source.indexOf("-->", fromMarker);
    const beforeTo = source.lastIndexOf("<!--", toMarker);
    region =
      afterFrom !== -1 && beforeTo !== -1 && beforeTo > afterFrom
        ? source.slice(afterFrom + 3, beforeTo).trim()
        : "";
  } else {
    // Fallback: no markers — strip document scaffolding
    region = source.trim();
    for (const closer of ["</body>", "</html>"]) {
      const idx = region.lastIndexOf(closer);
      if (idx !== -1) region = region.slice(0, idx).trim();
    }
    for (const opener of ["</head>", "<body>", "<html...>"]) {
      const idx = region.toLowerCase().indexOf(opener.toLowerCase());
      if (idx === 0) region = region.slice(opener.length).trim();
    }
  }
  const styles = [...region.matchAll(/<style>([\s\S]*?)<\/style>/gu)].map((m) => m[1] ?? "");
  const css = styles.length > 0 ? styles.join("\n").trim() : null;
  const markup = region.replace(/<style>[\s\S]*?<\/style>/gu, "").trim();
  return { css, markup };
};

/** Generate a stable marker comment for idempotent injection. */
const blockMarker = (name: string): string => `<!-- frogoe:block:${name} -->`;

/** The five safe-area corners the hud layer positions wrappers at. */
const CORNERS = ["top-left", "top-center", "top-right", "bottom-left", "bottom-center"];

/** Inject CSS + markup into index.html (replaces previous install of the
 *  same block). Returns the modified HTML or null if nothing to inject. */
export const injectIntoHtml = (
  html: string,
  name: string,
  css: string | null,
  markup: string,
  placement: string,
  pos?: string,
): string | null => {
  if (!css && !markup) return null;
  const marker = blockMarker(name);
  let out = html;

  // Remove previous install (idempotent) — string-based, not regex
  const firstIdx = out.indexOf(marker);
  if (firstIdx !== -1) {
    const lastIdx = out.lastIndexOf(marker);
    if (lastIdx > firstIdx) {
      out = out.slice(0, firstIdx).trimEnd() + "\n      " + out.slice(lastIdx + marker.length);
    }
  }

  // Inject CSS before the closing </style> in <head>
  if (css) {
    const styleClose = out.lastIndexOf("</style>");
    if (styleClose === -1) return null;
    const cssBlock = `\n    /* ===== ${name} (frogoe add) ===== */\n    ${css}\n  `;
    out = out.slice(0, styleClose) + cssBlock + out.slice(styleClose);
  }

  // Inject markup inside the .hud layer. TWO shapes, and the difference
  // is load-bearing (the game-over card shipped mis-anchored twice):
  //  - overlay blocks are FLOW content — they go inside a positioned
  //    wrapper carrying the corner (data-pos from the registry)
  //  - overlay-fullscreen / overlay-anchored blocks position THEMSELVES
  //    (absolute inset:0, bottom-docked keyboards) — a wrapper would
  //    shrink-wrap and become their anchoring box. They are injected as
  //    DIRECT children of .hud, no wrapper.
  if (markup) {
    const corner = pos && CORNERS.includes(pos) ? pos : "top-left";
    const direct = placement === "overlay-fullscreen" || placement === "overlay-anchored";
    const indented = markup
      .split("\n")
      .map((l) => `        ${l}`)
      .join("\n");
    const wrapped = direct
      ? `\n      ${marker}\n${indented}\n      ${marker}`
      : `\n      ${marker}\n      <div data-pos="${corner}">\n${indented}\n      </div>\n      ${marker}`;
    // Find the .hud div's closing tag
    const hudOpen = out.indexOf('class="hud"');
    if (hudOpen === -1) return null;
    const afterHudOpen = out.indexOf(">", hudOpen);
    if (afterHudOpen === -1) return null;
    // Find the closing </div> of the .hud element
    // (first </div> that's not inside a nested element)
    let depth = 1;
    let searchFrom = afterHudOpen + 1;
    let hudEnd = -1;
    while (searchFrom < out.length) {
      const open = out.indexOf("<div", searchFrom);
      const close = out.indexOf("</div>", searchFrom);
      if (close === -1) break;
      if (open !== -1 && open < close) {
        depth++;
        searchFrom = open + 4;
      } else {
        depth--;
        if (depth === 0) {
          hudEnd = close;
          break;
        }
        searchFrom = close + 6;
      }
    }
    if (hudEnd === -1) return null;
    out = out.slice(0, hudEnd) + wrapped + out.slice(hudEnd);
  }

  return out;
};

export const addBlock = (
  name: string,
  options?: { dir?: string; noInject?: boolean },
): AddResult => {
  const root = options?.dir ?? process.cwd();
  const registry = registryRoot();
  const blockDir = path.join(registry, "blocks", name);
  if (!existsSync(blockDir)) {
    const available = readFileSync(path.join(registry, "registry.json"), "utf-8");
    const known = (JSON.parse(available) as { items: Array<{ name: string }> }).items
      .map((i) => i.name)
      .join(", ");
    throw new Error(`frogoe add: unknown block "${name}". Available: ${known}`);
  }

  const item = JSON.parse(
    readFileSync(path.join(blockDir, "registry-item.json"), "utf-8"),
  ) as RegistryItem;

  // integrity: manifest ↔ markup must agree before anything is copied
  const markupFiles = item.files
    .filter((f) => f.type === "frogoe:markup")
    .map((f) => path.join(blockDir, f.path));
  if (markupFiles.length === 0) {
    throw new Error(`frogoe add: block "${name}" has no markup file in its manifest.`);
  }
  const source = markupFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
  for (const binding of item.bindings ?? []) {
    if (!source.includes(binding)) {
      throw new Error(
        `frogoe add: block "${name}" is broken — manifest binding ${binding} missing from its markup. Report it; nothing was copied.`,
      );
    }
  }

  // Copy block source to blocks/ (for reference + custom editing)
  mkdirSync(path.join(root, "blocks"), { recursive: true });
  cpSync(markupFiles[0] ?? "", path.join(root, "blocks", `${name}.html`));

  // Smart inject into index.html
  let injected = false;
  const placement = item.placement ?? "overlay";
  if (!options?.noInject) {
    const indexPath = path.join(root, "index.html");
    if (existsSync(indexPath)) {
      const html = readFileSync(indexPath, "utf-8");
      const { css, markup } = parseBlock(source);
      const modified = injectIntoHtml(html, name, css, markup, placement, item.pos);
      if (modified) {
        writeFileSync(indexPath, modified, "utf-8");
        injected = true;
      }
    }
  }

  return {
    bindings: item.bindings ?? [],
    block: name,
    injected,
    placement,
  };
};
