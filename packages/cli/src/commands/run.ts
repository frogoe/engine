import { defineCommand } from "citty";

import { printBanner, startServer } from "../run.ts";

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    port: { type: "string", description: "port (default: random free)" },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const port = args.port ? Number(args.port) : 0;
    if (!Number.isInteger(port) || port < 0) {
      throw new Error(`frogoe run: invalid port "${String(args.port)}"`);
    }
    const server = await startServer(dir, port);
    printBanner(server.urls);
    await new Promise(() => {});
  },
  meta: { description: "serve with live reload + phone QR" },
});
