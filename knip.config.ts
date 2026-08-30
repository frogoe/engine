import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "packages/*": {
      entry: ["src/**", "test/**/*.test.ts"],
    },
  },
  ignore: ["examples/**", "commitlint.config.js"],
  ignoreDependencies: ["@commitlint/config-conventional"],
  // system probes, not npm binaries: the tunnel daemon we manage ourselves
  ignoreBinaries: ["cloudflared"],
};

export default config;
