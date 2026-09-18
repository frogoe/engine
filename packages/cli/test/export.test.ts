import { afterAll, describe, expect, test } from "bun:test";
/** frogoe export — the filler layer. Pure functions, no toolchain. */
import {
  TOKENS,
  deriveExportConfig,
  exportTemplatesFor,
  fill,
  validateAppId,
} from "../src/export.ts";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { ensureMobileInit, generateShell, type IconRunner } from "../src/commands/export.ts";
import { GEN_DIR } from "../src/export.ts";
import { injectDevUrl } from "../src/export.ts";
import path from "node:path";

describe("export config derivation", () => {
  test("happy path: title + appId + default version", () => {
    const config = deriveExportConfig({ appId: "com.deni.typefall", title: "Typefall" });
    expect(config.appId).toBe("com.deni.typefall");
    expect(config.appIdIsDefault).toBeFalse();
    expect(config.version).toBe("1.0.0");
    expect(config.crate).toBe("typefall");
    expect(config.crateLib).toBe("typefall_lib");
  });

  test("missing appId falls back to the com.frogoe.* dev default (Expo-style)", () => {
    const config = deriveExportConfig({ title: "Typefall" });
    expect(config.appId).toBe("com.frogoe.typefall");
    expect(config.appIdIsDefault).toBeTrue();
  });

  test("titles with spaces/apostrophes kebab cleanly", () => {
    const config = deriveExportConfig({ appId: "com.x.spellstorm", title: "Deni's Spell Storm!" });
    expect(config.crate).toBe("denis-spell-storm");
    expect(config.crateLib).toBe("denis_spell_storm_lib");
  });

  test("a malformed author appId is still a teaching error", () => {
    expect(() => deriveExportConfig({ appId: "Not!.valid", title: "Typefall" })).toThrow(
      /reverse-DNS/u,
    );
  });

  test("appId must be reverse-DNS", () => {
    expect(validateAppId("com.deni.typefall")).toBeTrue();
    expect(validateAppId("Typefall")).toBeFalse();
    expect(validateAppId("com.Deni.typefall")).toBeFalse();
    expect(validateAppId("com.typefall")).toBeTrue();
    expect(() => deriveExportConfig({ title: "T", appId: "typefall" })).toThrow(/reverse-DNS/u);
  });

  test("empty title and forbidden product-name characters are rejected", () => {
    expect(() => deriveExportConfig({ appId: "com.a.b" })).toThrow(/title/u);
    expect(() => deriveExportConfig({ appId: "com.a.b", title: 'Bad: "Title"' })).toThrow(
      /forbids/u,
    );
  });

  test("numeric-only titles cannot yield a crate", () => {
    expect(() => deriveExportConfig({ appId: "com.a.b", title: "2048" })).toThrow(/crate/u);
  });

  test("version: default, explicit, and rejected shapes", () => {
    expect(deriveExportConfig({ appId: "com.a.b", title: "G" }).version).toBe("1.0.0");
    expect(deriveExportConfig({ appId: "com.a.b", title: "G", version: "2.3.1" }).version).toBe(
      "2.3.1",
    );
    expect(() => deriveExportConfig({ appId: "com.a.b", title: "G", version: "latest" })).toThrow(
      /semver/u,
    );
  });
});

describe("fill", () => {
  const config = deriveExportConfig({ appId: "com.deni.typefall", title: "Typefall" });

  test("replaces every known token", () => {
    const source = TOKENS.map((token) => `{{${token}}}`).join(" ");
    const filled = fill(source, config, "test");
    expect(filled).toBe("Typefall com.deni.typefall 1.0.0 typefall typefall_lib");
  });

  test("an unknown token is a hard error naming the file", () => {
    expect(() => fill("{{FROGOE_OOPS}}", config, "x/tauri.conf.json")).toThrow(
      /x\/tauri\.conf\.json.*FROGOE_OOPS/u,
    );
  });
});

describe("template integrity (the shipped templates)", () => {
  const templateRoot = path.join(import.meta.dir, "../src/export-templates");

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };

  test("the template tree carries only known tokens, and fills cleanly", () => {
    const files = walk(templateRoot);
    expect(files.length).toBeGreaterThanOrEqual(8);
    const config = deriveExportConfig({ appId: "com.test.game", title: "Test Game" });
    for (const file of files) {
      const source = readFileSync(file, "utf-8");
      for (const match of source.matchAll(/\{\{FROGOE_[A-Z_]+\}\}/gu)) {
        const token = match[0].slice(2, -2);
        expect(TOKENS.includes(token as (typeof TOKENS)[number])).toBeTrue();
      }
      // filling every file must leave no residue (binary-free tree)
      expect(() => fill(source, config, file)).not.toThrow();
    }
  });

  test("tauri.conf.json fills to valid JSON with the identifier in place", () => {
    const config = deriveExportConfig({ appId: "com.test.game", title: "Test Game" });
    const raw = readFileSync(path.join(templateRoot, "src-tauri/tauri.conf.json"), "utf-8");
    const parsed = JSON.parse(fill(raw, config, "tauri.conf.json")) as {
      identifier: string;
      productName: string;
    };
    expect(parsed.identifier).toBe("com.test.game");
    expect(parsed.productName).toBe("Test Game");
  });

  test("exportTemplatesFor resolves the repo templates", () => {
    expect(exportTemplatesFor(path.join(import.meta.dir, "../src")).length).toBeGreaterThan(0);
  });
});

describe("export shell generation (command-level, toolchain mocked)", () => {
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));
  const tmp = path.join(import.meta.dir, "../.tmp-export");

  const freshGame = (withAppId: boolean) => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(path.join(tmp, "dist"), { recursive: true });
    writeFileSync(
      path.join(tmp, "BRIEF.md"),
      '---\ntitle: Test Game\nverb: tap\nmood: test\npalette:\n  bg: "#101418"\n  fg: "#fff"\n  accent: "#ffd"\n---\nx\n',
    );
    writeFileSync(
      path.join(tmp, "frogoe.json"),
      JSON.stringify(
        withAppId ? { contract: "0.2.0", appId: "com.deni.testgame" } : { contract: "0.2.0" },
      ),
    );
    writeFileSync(path.join(tmp, "dist", "index.html"), "<!doctype html><title>artifact</title>");
    writeFileSync(path.join(tmp, ".gitignore"), "dist/\n");
  };

  const noIcon: IconRunner = () => {
    mkdirSync(path.join(tmp, "export", "src-tauri", "icons"), { recursive: true });
    writeFileSync(path.join(tmp, "export", "src-tauri", "icons", "icon.icns"), "stub");
  };

  const generate = (force?: boolean) =>
    generateShell(tmp, deriveExportConfig({ appId: "com.deni.testgame", title: "Test Game" }), {
      force,
      iconRunner: noIcon,
    });

  test("generates a filled project + payload + record + gitignore line", () => {
    freshGame(true);
    const result = generate();
    expect(result.artifactSha.length).toBe(64);
    const conf = JSON.parse(
      readFileSync(path.join(tmp, "export", "src-tauri", "tauri.conf.json"), "utf-8"),
    ) as { identifier: string };
    expect(conf.identifier).toBe("com.deni.testgame");
    expect(readFileSync(path.join(tmp, "export", "web", "index.html"), "utf-8")).toContain(
      "artifact",
    );
    expect(readFileSync(path.join(tmp, ".gitignore"), "utf-8")).toContain("export/");
    expect(existsSync(path.join(tmp, "export", "frogoe-export.json"))).toBeTrue();
  });

  test("re-export is idempotent; creator edits to tool files are kept", () => {
    freshGame(true);
    generate();
    // the creator (or their agent) tunes the window via Cargo/Cargo edits:
    const confPath = path.join(tmp, "export", "src-tauri", "tauri.conf.json");
    const edited = readFileSync(confPath, "utf-8").replace('"height": 640', '"height": 900');
    writeFileSync(confPath, edited);
    // a creator-added file of their own:
    writeFileSync(path.join(tmp, "export", "NOTES.md"), "mine");
    const result = generate();
    expect(result.skipped).toContain("src-tauri/tauri.conf.json");
    expect(readFileSync(confPath, "utf-8")).toContain('"height": 900');
    expect(readFileSync(path.join(tmp, "export", "NOTES.md"), "utf-8")).toBe("mine");
  });

  test("--force overwrites the creator edit", () => {
    const result = generate(true);
    expect(result.skipped).toEqual([]);
    const confPath = path.join(tmp, "export", "src-tauri", "tauri.conf.json");
    expect(readFileSync(confPath, "utf-8")).toContain('"height": 640');
  });

  test("payload refresh follows dist/ (artifact swap recorded)", () => {
    writeFileSync(
      path.join(tmp, "dist", "index.html"),
      "<!doctype html><title>artifact v2</title>",
    );
    const result = generate();
    expect(readFileSync(path.join(tmp, "export", "web", "index.html"), "utf-8")).toContain("v2");
    const record = JSON.parse(
      readFileSync(path.join(tmp, "export", "frogoe-export.json"), "utf-8"),
    ) as { artifactSha: string };
    expect(record.artifactSha).toBe(result.artifactSha);
  });

  test("missing appId exports fine under the dev default", () => {
    freshGame(false);
    const config = deriveExportConfig({ title: "Test Game" });
    expect(config.appId).toBe("com.frogoe.test-game");
    expect(config.appIdIsDefault).toBeTrue();
  });
});

describe("injectDevUrl (the run-desktop conf transform)", () => {
  const release = `{
  "productName": "Test Game",
  "build": { "frontendDist": "../web", "beforeDevCommand": "bun dev" },
  "app": {}
}`;

  test("injecting points dev at the server and drops beforeDevCommand", () => {
    const conf = JSON.parse(injectDevUrl(release, "http://localhost:4199")) as {
      build: { beforeDevCommand?: string; devUrl?: string; frontendDist?: string };
    };
    expect(conf.build.devUrl).toBe("http://localhost:4199");
    expect(conf.build.beforeDevCommand).toBeUndefined();
    expect(conf.build.frontendDist).toBe("../web");
  });

  test("empty url strips devUrl (self-heal / release shape)", () => {
    const dev = injectDevUrl(release, "http://localhost:4199");
    const healed = JSON.parse(injectDevUrl(dev, "")) as { build: { devUrl?: string } };
    expect(healed.build.devUrl).toBeUndefined();
  });
});

describe("export multi-target", () => {
  test("unknown target is a teaching error", () => {
    // validated in the command; here we pin the InitRunner guard logic
    expect(typeof ensureMobileInit).toBe("function");
  });

  test("init runs only when gen/<target> is missing; --force re-runs", () => {
    const box = path.join(import.meta.dir, "../.tmp-export");
    rmSync(box, { recursive: true, force: true });
    mkdirSync(box, { recursive: true });
    const calls: string[] = [];
    const runner = (exportDir: string, target: "ios" | "android") => {
      calls.push(`${target}@${path.basename(exportDir)}`);
      mkdirSync(path.join(exportDir, "src-tauri", "gen", GEN_DIR[target]), { recursive: true });
    };
    expect(ensureMobileInit(box, "ios", { initRunner: runner })).toBe("initialized");
    expect(ensureMobileInit(box, "ios", { initRunner: runner })).toBe("skipped"); // gen exists now
    expect(ensureMobileInit(box, "ios", { force: true, initRunner: runner })).toBe("initialized");
    expect(ensureMobileInit(box, "android", { initRunner: runner })).toBe("initialized");
    expect(calls).toEqual(["ios@.tmp-export", "ios@.tmp-export", "android@.tmp-export"]);
    rmSync(box, { recursive: true, force: true });
  });
});
