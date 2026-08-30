import { describe, expect, test } from "bun:test";
/** Release guards — the publish workflow's decision logic, tested the
 *  way HyperFrames tests theirs (scripts/*.test). Every guard here once
 *  burned us as untested YAML shell. */
import {
  NPM_TRUSTED_PUBLISHING_FLOOR,
  npmSupportsTrustedPublishing,
  packManifestErrors,
  resolveChannel,
} from "../scripts/release-guards.mjs";

describe("resolveChannel", () => {
  test("stable versions publish on latest", () => {
    expect(resolveChannel("0.2.2")).toEqual({ channel: "stable", distTag: "latest" });
    expect(resolveChannel("1.0.0")).toEqual({ channel: "stable", distTag: "latest" });
  });
  test("prerelease versions publish on their channel tag", () => {
    expect(resolveChannel("0.2.3-beta.1")).toEqual({ channel: "prerelease", distTag: "beta" });
    expect(resolveChannel("1.0.0-rc.2")).toEqual({ channel: "prerelease", distTag: "rc" });
    expect(resolveChannel("0.2.3-next.15")).toEqual({ channel: "prerelease", distTag: "next" });
  });
  test("garbage resolves to null (workflow exits nonzero)", () => {
    for (const bad of ["", "v0.2.2", "0.2", "latest", "0.2.3-"]) {
      expect(resolveChannel(bad)).toBeNull();
    }
  });
});

describe("packManifestErrors", () => {
  const healthy = [
    "npm notice 251B bin/frogoe.mjs",
    "npm notice 117.3kB dist/cli.js",
    "npm notice 7.2kB dist/contract/contract.js",
    "npm notice total files: 32",
  ].join("\n");

  test("a full tarball passes", () => {
    expect(packManifestErrors(healthy)).toEqual([]);
  });
  test("the gutted 0.2.1 tarball (2 files, no dist/) is rejected on every axis", () => {
    const gutted = ["npm notice 251B bin/frogoe.mjs", "npm notice total files: 2"].join("\n");
    const errors = packManifestErrors(gutted);
    expect(errors).toContain("missing dist/cli.js");
    expect(errors).toContain("missing dist/contract/contract.js");
    expect(errors.some((e) => e.includes("min 20"))).toBeTrue();
  });
  test("prefix lookalikes do not satisfy the must-contain check", () => {
    const sneaky = ["npm notice 1.1kB dist/cli.js.map", "npm notice total files: 32"].join("\n");
    expect(packManifestErrors(sneaky)).toContain("missing dist/cli.js");
  });
  test("a non-pack log is an error, not a pass", () => {
    expect(packManifestErrors("Unpacking packages ...")).toContain(
      "no 'total files:' line — not an npm pack log?",
    );
  });
});

describe("npm trusted publishing floor", () => {
  test(`npm must be >= ${NPM_TRUSTED_PUBLISHING_FLOOR} (the ENEEDAUTH lesson)`, () => {
    expect(npmSupportsTrustedPublishing("11.9.0")).toBeTrue();
    expect(npmSupportsTrustedPublishing("12.0.0")).toBeTrue();
    expect(npmSupportsTrustedPublishing("11.5.1")).toBeTrue();
    expect(npmSupportsTrustedPublishing("11.5.0")).toBeFalse();
    expect(npmSupportsTrustedPublishing("10.8.2")).toBeFalse();
  });
});
