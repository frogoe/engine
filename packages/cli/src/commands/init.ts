import { defineCommand } from "citty";

import { scaffold } from "../init.ts";

export const command = defineCommand({
  args: {
    force: { type: "boolean", description: "rematerialize over an existing game" },
    name: { type: "positional", description: "folder to create" },
  },
  async run({ args }) {
    const name = args.name ?? ".";
    const result = scaffold(String(name), { force: args.force === true });
    console.log(`frogoe init — ${result.dir}`);
    for (const file of result.files) {
      console.log(`  + ${file}`);
    }
    console.log(`\n  next: cd ${name} && frogoe run`);
  },
  meta: { description: "scaffold a runnable game folder" },
});
