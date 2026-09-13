import type { KnipConfig } from "knip";

const config: KnipConfig = {
  workspaces: {
    "packages/*": {
      entry: ["src/**", "test/**/*.test.ts"],
    },
  },
  ignore: [
    "examples/**",
    "commitlint.config.js",
    "scripts/gen-skills-manifest.mjs",
    "packages/cli/test/embed.e2e.ts",
    "scripts/lib/hashSkill.mjs",
  ],
  ignoreDependencies: ["@commitlint/config-conventional"],
  // system probes, not npm binaries: the tunnel daemon we manage ourselves;
  // tauri runs inside the GENERATED export/ project (its own package.json),
  // never as a dependency of this CLI
  ignoreBinaries: ["cloudflared", "tauri"],
};

export default config;
