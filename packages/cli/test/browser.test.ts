import { afterAll, describe, expect, test } from "bun:test";
/** browser/ decisions — pure functions and filesystem-shaped fixtures. The
 *  network is never touched here: corruption strings, env parsing, lock
 *  semantics, legacy-cache migration, and error wrapping are exactly the
 *  parts that must hold before any download can be trusted. */
import { existsSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ARCHIVE_CHECKSUMS,
  browserPathHintForPlatform,
  findInCache,
  isCorruptInstallError,
  migrateLegacyCache,
  positiveIntEnv,
  pruneLegacyCache,
  wrapDownloadFailure,
  wrapLaunchFailure,
} from "../src/browser/manager.ts";
import { launchBudgets } from "../src/browser/launch.ts";
import { withInstallLock } from "../src/browser/lock.ts";

const TEMP_ROOTS: string[] = [];
const tempDir = (label: string): string => {
  const dir = mkdtempSync(path.join(tmpdir(), `frogoe-${label}-`));
  TEMP_ROOTS.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of TEMP_ROOTS) rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ——— corruption detection ————————————————————————————————————————

describe("isCorruptInstallError", () => {
  test("recognizes every archive/install corruption dialect", () => {
    const corrupted = [
      "invalid end of central directory record",
      "File: unexpected end of file",
      "end-of-central-directory signature not found",
      "corrupted zip: cannot read",
      "not a zip file",
      "Integrity check failed for downloaded browser archive.\n  URL: x\n  Expected: a\n  Actual: b",
      "The browser folder (/x) exists but the executable (/y) is missing. An earlier install of this build probably did not finish.",
    ];
    for (const message of corrupted) {
      expect(isCorruptInstallError(new Error(message))).toBeTrue();
    }
  });
  test("recognizes corruption buried inside the providers aggregate", () => {
    const wrapped =
      "All providers failed for chrome-headless-shell 131.0.6778.204: - default: Error: File: unexpected end of file";
    expect(isCorruptInstallError(new Error(wrapped))).toBeTrue();
  });
  test("network and platform failures are NOT corruption (no pointless retry)", () => {
    const transient = [
      "getaddrinfo EAI_AGAIN storage.googleapis.com",
      "All providers failed for chrome-headless-shell 131.0.6778.204: - default: Error: socket hang up",
      "Cannot download a binary for the provided platform: sunos",
      "Timed out after 30000 ms",
    ];
    for (const message of transient) {
      expect(isCorruptInstallError(new Error(message))).toBeFalse();
    }
  });
  test("non-error inputs are never corruption", () => {
    expect(isCorruptInstallError(undefined)).toBeFalse();
    expect(isCorruptInstallError("strings pass through")).toBeFalse();
    expect(isCorruptInstallError({ weird: true })).toBeFalse();
  });
});

// ——— env parsing ————————————————————————————————————————————————

describe("positiveIntEnv", () => {
  test("unset and empty fall back", () => {
    expect(positiveIntEnv("FROGOE_X_MS", undefined, 120_000)).toBe(120_000);
    expect(positiveIntEnv("FROGOE_X_MS", "", 120_000)).toBe(120_000);
    expect(positiveIntEnv("FROGOE_X_MS", "   ", 120_000)).toBe(120_000);
  });
  test("a positive integer parses (surrounding whitespace tolerated)", () => {
    expect(positiveIntEnv("FROGOE_X_MS", "240000", 120_000)).toBe(240_000);
    expect(positiveIntEnv("FROGOE_X_MS", " 240000 ", 120_000)).toBe(240_000);
  });
  test("garbage, zero and negatives are teaching errors naming the knob", () => {
    for (const bad of ["abc", "0", "-1", "1.5", "20s"]) {
      expect(() => positiveIntEnv("FROGOE_X_MS", bad, 120_000)).toThrow(
        /^frogoe browser: FROGOE_X_MS/u,
      );
    }
  });
});

// ——— checksum pinning ————————————————————————————————————————————

describe("ARCHIVE_CHECKSUMS", () => {
  test("covers every BrowserPlatform @puppeteer/browsers can detect", () => {
    // keys are BrowserPlatform values (detectBrowserPlatform()), NOT the
    // CDN folder names (mac-arm64) — a silent mismatch downgrades the
    // download to unverified, exactly what this pin exists to prevent
    expect(Object.keys(ARCHIVE_CHECKSUMS).sort()).toEqual(
      ["linux", "mac", "mac_arm", "win32", "win64"].sort(),
    );
  });
  test("every value is a lowercase sha256 hex digest", () => {
    for (const value of Object.values(ARCHIVE_CHECKSUMS)) {
      expect(value).toMatch(/^[0-9a-f]{64}$/u);
    }
  });
});

// ——— teaching errors —————————————————————————————————————————————

describe("browserPathHintForPlatform", () => {
  test("names a real Chrome location per platform", () => {
    expect(browserPathHintForPlatform("darwin")).toBe(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    );
    expect(browserPathHintForPlatform("win32")).toBe(
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    );
    expect(browserPathHintForPlatform("linux")).toBe("/usr/bin/google-chrome");
  });
});

describe("wrapDownloadFailure", () => {
  test("message teaches the escape hatch and preserves the cause", () => {
    const cause = new Error("getaddrinfo EAI_AGAIN storage.googleapis.com");
    const wrapped = wrapDownloadFailure(cause);
    expect(wrapped.message).toMatch(/^frogoe browser:/u);
    expect(wrapped.message).toContain("FROGOE_BROWSER_PATH");
    expect(wrapped.message).toContain(browserPathHintForPlatform(process.platform));
    expect(wrapped.message).toContain("getaddrinfo EAI_AGAIN");
    expect(wrapped.cause).toBe(cause);
  });
});

describe("wrapLaunchFailure", () => {
  test("timeout errors point at FROGOE_LAUNCH_TIMEOUT_MS", () => {
    const timeout = new Error("Timed out after 120000 ms while waiting for the WS endpoint");
    timeout.name = "TimeoutError";
    const wrapped = wrapLaunchFailure(timeout, 120_000);
    expect(wrapped.message).toMatch(/^frogoe browser:/u);
    expect(wrapped.message).toContain("FROGOE_LAUNCH_TIMEOUT_MS=240000");
    expect(wrapped.message).toContain("FROGOE_BROWSER_PATH");
    expect(wrapped.cause).toBe(timeout);
  });
  test("non-timeout errors still teach the browser-path hatch", () => {
    const wrapped = wrapLaunchFailure(new Error("Target closed"), 120_000);
    expect(wrapped.message).toMatch(/^frogoe browser:/u);
    expect(wrapped.message).toContain("FROGOE_BROWSER_PATH");
    expect(wrapped.message).toContain("Target closed");
  });
});

test("every wrapped browser error satisfies the CLI teaching-error boundary", () => {
  // cli.ts prints message-only (no stack) for /^frogoe / messages — the
  // contract our browser errors must keep to stay agent-friendly
  const pattern = /^frogoe /u;
  expect(pattern.test(wrapDownloadFailure(new Error("x")).message)).toBeTrue();
  expect(pattern.test(wrapLaunchFailure(new Error("x"), 1000).message)).toBeTrue();
});

// ——— install lock ————————————————————————————————————————————————

describe("withInstallLock", () => {
  const fastTimings = { heartbeatMs: 20, pollMs: 5, staleMs: 150, waitNoticeMs: 10_000 };
  const fast = { timings: fastTimings };

  test("concurrent sections never overlap (the mutex holds)", async () => {
    const root = tempDir("lock-race");
    let active = 0;
    let max = 0;
    const section = async (): Promise<void> => {
      active += 1;
      max = Math.max(max, active);
      await sleep(25);
      active -= 1;
    };
    await Promise.all([
      withInstallLock(section, root, fast),
      withInstallLock(section, root, fast),
      withInstallLock(section, root, fast),
    ]);
    expect(max).toBe(1);
  });

  test("the lock directory is released when the section ends", async () => {
    const root = tempDir("lock-release");
    await withInstallLock(() => Promise.resolve("done"), root, fast);
    expect(existsSync(path.join(root, ".chrome.install.lock"))).toBeFalse();
  });

  test("a stale lock (crashed installer) is reclaimed, not deadlocked on", async () => {
    const root = tempDir("lock-stale");
    const lockDir = path.join(root, ".chrome.install.lock");
    mkdirSync(lockDir, { recursive: true });
    const ancient = new Date(Date.now() - 3_600_000);
    utimesSync(lockDir, ancient, ancient);
    let ran = false;
    await withInstallLock(
      () => {
        ran = true;
        return Promise.resolve(42);
      },
      root,
      fast,
    );
    expect(ran).toBeTrue();
  });

  test("a fresh foreign lock is waited out, not stolen", async () => {
    const root = tempDir("lock-wait");
    const lockDir = path.join(root, ".chrome.install.lock");
    mkdirSync(lockDir, { recursive: true });
    // fresh mtime — the waiter must poll until staleMs reclaims it
    let stolen = false;
    const result = withInstallLock(
      () => {
        stolen = true;
        return Promise.resolve("acquired");
      },
      root,
      fast,
    );
    await sleep(50);
    expect(stolen).toBeFalse();
    await result;
    expect(stolen).toBeTrue();
  });

  test("an abandoned reclaim gate ages out instead of blocking forever", async () => {
    const root = tempDir("lock-gate");
    const reclaimDir = path.join(root, ".chrome.install.reclaim.lock");
    mkdirSync(reclaimDir, { recursive: true });
    const ancient = new Date(Date.now() - 3_600_000);
    utimesSync(reclaimDir, ancient, ancient);
    let ran = false;
    await withInstallLock(
      () => {
        ran = true;
        return Promise.resolve();
      },
      root,
      fast,
    );
    expect(ran).toBeTrue();
  });
});

// ——— launch budgets ——————————————————————————————————————————————

describe("launchBudgets", () => {
  test("defaults are the hyperframes production budgets", () => {
    expect(launchBudgets({})).toEqual({ launchMs: 120_000, protocolMs: 300_000 });
  });
  test("both budgets honor their env knobs", () => {
    expect(
      launchBudgets({ FROGOE_LAUNCH_TIMEOUT_MS: "240000", FROGOE_PROTOCOL_TIMEOUT_MS: "600000" }),
    ).toEqual({ launchMs: 240_000, protocolMs: 600_000 });
  });
  test("garbage fails loudly instead of silently timing out forever", () => {
    expect(() => launchBudgets({ FROGOE_LAUNCH_TIMEOUT_MS: "soon" })).toThrow(
      /^frogoe browser: FROGOE_LAUNCH_TIMEOUT_MS/u,
    );
    expect(() => launchBudgets({ FROGOE_PROTOCOL_TIMEOUT_MS: "0" })).toThrow(
      /^frogoe browser: FROGOE_PROTOCOL_TIMEOUT_MS/u,
    );
  });
});

// ——— cache lookup + legacy migration (real @puppeteer/browsers layout) ———

/** This machine's platform — fixtures must match it for getInstalledBrowsers
 *  to resolve them the way production would. */
const detectedPlatform = async (): Promise<string> => {
  const { detectBrowserPlatform } = await import("@puppeteer/browsers");
  const platform = detectBrowserPlatform();
  if (!platform) throw new Error("no supported browser platform on this machine");
  return platform;
};

/** Build a fake install that getInstalledBrowsers actually resolves: the
 *  layout is <cacheDir>/chrome-headless-shell/<platform>-<buildId>/ and
 *  the executable is whatever the entry's computed executablePath says. */
const fakeInstall = async (
  cacheDir: string,
  withExecutable: boolean,
  buildId = "131.0.6778.204",
): Promise<{ buildId: string; executablePath: string }> => {
  const platform = await detectedPlatform();
  mkdirSync(path.join(cacheDir, "chrome-headless-shell", `${platform}-${buildId}`), {
    recursive: true,
  });
  const { getInstalledBrowsers } = await import("@puppeteer/browsers");
  const entry = (await getInstalledBrowsers({ cacheDir })).find(
    (b) => b.buildId === buildId && b.platform === platform,
  );
  if (!entry) throw new Error("fixture: getInstalledBrowsers did not see the fake install");
  if (withExecutable) {
    mkdirSync(path.dirname(entry.executablePath), { recursive: true });
    writeFileSync(entry.executablePath, "#!/bin/sh\n# fake chrome-headless-shell\n");
  }
  return { buildId, executablePath: entry.executablePath };
};

describe("findInCache", () => {
  test("a complete install resolves to its executable", async () => {
    const cacheDir = tempDir("cache-hit");
    const fixture = await fakeInstall(cacheDir, true);
    const found = await findInCache(cacheDir, "131.0.6778.204");
    expect(found.executablePath).toBe(fixture.executablePath);
    expect(found.staleInstallPath).toBeUndefined();
  });
  test("an install whose executable is missing reports the stale dir to purge", async () => {
    const cacheDir = tempDir("cache-stale");
    const platform = await detectedPlatform();
    await fakeInstall(cacheDir, false);
    const found = await findInCache(cacheDir, "131.0.6778.204");
    expect(found.executablePath).toBeUndefined();
    expect(found.staleInstallPath).toBeDefined();
    expect(found.staleInstallPath ?? "").toMatch(
      new RegExp(`${platform}-131\\.0\\.6778\\.204$`, "u"),
    );
  });
  test("a different buildId is invisible (the pin is exact)", async () => {
    const cacheDir = tempDir("cache-pin");
    await fakeInstall(cacheDir, true);
    const found = await findInCache(cacheDir, "999.0.0000.000");
    expect(found.executablePath).toBeUndefined();
    expect(found.staleInstallPath).toBeUndefined();
  });
});

describe("migrateLegacyCache", () => {
  test("moves the per-project install into the global cache, verbatim", async () => {
    const legacyDir = tempDir("legacy-src");
    const cacheDir = tempDir("legacy-dst");
    const fixture = await fakeInstall(legacyDir, true);
    const migrated = await migrateLegacyCache(legacyDir, cacheDir, "131.0.6778.204");
    expect(migrated).toBeString();
    // the same install now resolves from the GLOBAL layout (same relative
    // shape, new root) and its executable is really there
    const found = await findInCache(cacheDir, "131.0.6778.204");
    expect(found.executablePath).toBe(
      path.join(cacheDir, path.relative(legacyDir, fixture.executablePath)),
    );
    expect(found.staleInstallPath).toBeUndefined();
    expect(existsSync(found.executablePath ?? "")).toBeTrue();
    // and the legacy tree is gone (no 172 MB zombie in node_modules —
    // not even an emptied root shell)
    expect(existsSync(legacyDir)).toBeFalse();
  });
  test("no legacy dir or wrong build → null, caller downloads", async () => {
    expect(
      await migrateLegacyCache(tempDir("legacy-empty"), tempDir("legacy-dst2"), "131.0.6778.204"),
    ).toBeNull();
    const wrongBuild = tempDir("legacy-wrong");
    await fakeInstall(wrongBuild, true, "999.0.0123.456");
    expect(
      await migrateLegacyCache(wrongBuild, tempDir("legacy-dst3"), "131.0.6778.204"),
    ).toBeNull();
  });
});

describe("pruneLegacyCache", () => {
  test("a superseded per-project cache is deleted once the global one owns the build", async () => {
    const legacyDir = tempDir("prune-hit");
    await fakeInstall(legacyDir, true);
    expect(pruneLegacyCache(legacyDir, "131.0.6778.204")).toBeTrue();
    expect(existsSync(legacyDir)).toBeFalse();
  });
  test("an emptied legacy root (post-migration shell) is swept too", () => {
    const empty = tempDir("prune-empty");
    mkdirSync(path.join(empty, "chrome-headless-shell"), { recursive: true });
    expect(pruneLegacyCache(empty, "131.0.6778.204")).toBeTrue();
    expect(existsSync(empty)).toBeFalse();
  });
  test("foreign or missing dirs are left alone", () => {
    const missing = path.join(tmpdir(), `frogoe-prune-absent-${String(Date.now())}`);
    expect(pruneLegacyCache(missing, "131.0.6778.204")).toBeFalse();
    const foreign = tempDir("prune-foreign");
    mkdirSync(path.join(foreign, "chrome-headless-shell", "mac-arm64-999.0.0000.000"), {
      recursive: true,
    });
    expect(pruneLegacyCache(foreign, "131.0.6778.204")).toBeFalse();
    expect(existsSync(foreign)).toBeTrue();
  });
});
