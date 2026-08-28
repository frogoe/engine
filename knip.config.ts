import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "packages/*": {
      entry: ["src/**", "test/**/*.test.ts"],
    },
  },
  ignore: ["examples/**", "commitlint.config.js"],
  ignoreDependencies: ["@commitlint/config-conventional"],
};

export default config;
