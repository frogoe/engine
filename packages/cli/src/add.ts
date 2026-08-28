/** frogoe add <block> — copy a registry HUD block into hud/.
 *  Validates the manifest and its bindings before copying (no broken blocks). */
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { registryRoot } from "./init.ts";

export interface AddResult {
  block: string;
  copiedTo: string;
  bindings: string[];
  placement: string;
}

interface RegistryItem {
  bindings?: string[];
  files: Array<{ path: string; target: string; type: string }>;
  name: string;
  placement?: string;
}

export const addBlock = (name: string, options?: { dir?: string }): AddResult => {
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
  const markup = markupFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
  for (const binding of item.bindings ?? []) {
    if (!markup.includes(binding)) {
      throw new Error(
        `frogoe add: block "${name}" is broken — manifest binding ${binding} missing from its markup. Report it; nothing was copied.`,
      );
    }
  }

  mkdirSync(path.join(root, "hud"), { recursive: true });
  const copiedTo = path.join(root, "hud", `${name}.html`);
  cpSync(markupFiles[0] ?? "", copiedTo);
  return {
    bindings: item.bindings ?? [],
    block: name,
    copiedTo,
    placement: item.placement ?? "overlay",
  };
};

/** The snippet printed after add: what to paste into index.html + theme. */
export const placementHint = (result: AddResult): string => {
  const pos = result.placement === "overlay-fullscreen" ? "" : ' data-pos="top-left"';
  return [
    `<!-- paste into the .hud layer of index.html: -->`,
    result.placement === "overlay-fullscreen"
      ? `<!-- ${result.block} is a fullscreen overlay: paste its markup directly inside <div class="hud"> -->`
      : `<div${pos}><!-- paste the block markup from hud/${result.block}.html --></div>`,
    `<!-- theme it from the BRIEF palette via .hud { --hud-* } (already in index.html) -->`,
  ].join("\n");
};
