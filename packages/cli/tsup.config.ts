import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    runtimeVersion: "src/runtimeVersion.ts",
  },
  format: ["esm"],
  outDir: "dist",
  target: "node22",
  platform: "node",
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  external: [
    "hono",
    "hono/*",
    "@hono/node-server",
    "qrcode-terminal",
    "puppeteer-core",
    "@puppeteer/browsers",
  ],
});
