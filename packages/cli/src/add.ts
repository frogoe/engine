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
}

const STYLE_PATTERN = /<style>([\s\S]*?)<\/style>/u;
const MARKUP_PATTERN = /<\/style>\s*([\s\S]*)$/u;

/** Extract CSS and markup from a block file. */
export const parseBlock = (source: string): { css: string | null; markup: string } => {
  const styleMatch = STYLE_PATTERN.exec(source);
  const markupMatch = MARKUP_PATTERN.exec(source);
  return {
    css: styleMatch?.[1]?.trim() ?? null,
    markup: (markupMatch?.[1] ?? "").trim(),
  };
};

/** Generate a stable marker comment for idempotent injection. */
const blockMarker = (name: string): string => `<!-- frogoe:block:${name} -->`;

/** Inject CSS + markup into index.html (replaces previous install of the
 *  same block). Returns the modified HTML or null if nothing to inject. */
export const injectIntoHtml = (
  html: string,
  name: string,
  css: string | null,
  markup: string,
  placement: string,
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

  // Inject markup inside the .hud layer
  if (markup) {
    const pos = placement === "overlay-fullscreen" ? "" : ' data-pos="top-left"';
    const wrapped = `\n      ${marker}\n      <div${pos}>\n${markup
      .split("\n")
      .map((l) => `        ${l}`)
      .join("\n")}\n      </div>\n      ${marker}`;
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
      const modified = injectIntoHtml(html, name, css, markup, placement);
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
