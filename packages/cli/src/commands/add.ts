import { defineCommand } from "citty";

import { addBlock, placementHint } from "../add.ts";

export const command = defineCommand({
  args: {
    block: { type: "positional", description: "registry block name (e.g. hud-score-card)" },
  },
  async run({ args }) {
    if (!args.block) {
      throw new Error("frogoe add <block> — e.g. frogoe add hud-fuel-gauge");
    }
    const result = addBlock(String(args.block));
    console.log(`frogoe add — ${result.block} → ${result.copiedTo}`);
    console.log(`  bindings: ${result.bindings.join(", ") || "(none)"}`);
    console.log(`\n${placementHint(result)}\n`);
    console.log("  then drive it from game.js with vanilla one-liners (see the block's demo.html)");
  },
  meta: { description: "copy a registry HUD block into hud/" },
});
