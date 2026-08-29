import { defineCommand } from "citty";

import { addBlock } from "../add.ts";

export const command = defineCommand({
  args: {
    block: { type: "positional", description: "registry block name (e.g. score-card)" },
  },
  async run({ args }) {
    if (!args.block) {
      throw new Error("frogoe add <block> — e.g. frogoe add fuel-gauge");
    }
    const result = addBlock(String(args.block));
    console.log(`frogoe add — ${result.block}`);
    if (result.injected) {
      console.log(`  ✓ styles + markup injected into index.html (idempotent — re-add replaces)`);
      console.log(`  ✓ source copied to blocks/${result.block}.html (for custom edits)`);
    } else {
      console.log(`  ✓ source copied to blocks/${result.block}.html`);
      console.log(`  ⚠ could not inject into index.html — paste markup + styles manually`);
    }
    console.log(`  bindings: ${result.bindings.join(", ") || "(none)"}`);
    console.log(`  drive it from game.js: document.querySelector('[data-block-...]')`);
  },
  meta: { description: "copy a registry HUD block into blocks/" },
});
