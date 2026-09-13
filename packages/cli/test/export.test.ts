import { describe, expect, test } from "bun:test";
/** frogoe export — the filler layer. Pure functions, no toolchain. */
import {
  ExportConfigError,
  TOKENS,
  deriveExportConfig,
  exportTemplatesFor,
  fill,
  validateAppId,
} from "../src/export.ts";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

describe("export config derivation", () => {
  test("happy path: title + appId + default version", () => {
    const config = deriveExportConfig({ appId: "com.deni.typefall", title: "Typefall" });
    expect(config).toEqual({
      appName: "Typefall",
      appId: "com.deni.typefall",
      version: "1.0.0",
      crate: "typefall",
      crateLib: "typefall_lib",
    });
  });

  test("titles with spaces/apostrophes kebab cleanly", () => {
    const config = deriveExportConfig({ appId: "com.x.spellstorm", title: "Deni's Spell Storm!" });
    expect(config.crate).toBe("denis-spell-storm");
    expect(config.crateLib).toBe("denis_spell_storm_lib");
  });

  test("missing appId is a teaching error, not a crash", () => {
    expect(() => deriveExportConfig({ title: "Typefall" })).toThrow(ExportConfigError);
    expect(() => deriveExportConfig({ title: "Typefall" })).toThrow(/"appId"/u);
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
