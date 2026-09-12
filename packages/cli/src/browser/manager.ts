/** Shared chrome-headless-shell resolution — ONE global install cache for
 *  the whole CLI (live sandbox, art rasterizer, vision, embed e2e),
 *  replacing the per-project node_modules/.frogoe-browser copies (~172 MB
 *  per game folder). The robustness patterns are ported from hyperframes
 *  (packages/cli/src/browser/manager.ts), where they were paid for in
 *  production: a cross-process install lock, corrupt-archive recovery
 *  (purge + retry exactly once), stale partial-install purge, visible
 *  download progress, sha256 archive pinning, and teaching errors that
 *  name the escape hatch instead of dumping a stack trace.
 *
 *  Resolution: FROGOE_BROWSER_PATH → global cache (exact pinned build)
 *  → one-time migration from a legacy per-project cache → download.
 *  Memoized per process. */
import { cpSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { cacheBase } from "../net/tunnel.ts";
import { isErrno, withInstallLock } from "./lock.ts";

/** The tested build — bump together with ARCHIVE_CHECKSUMS below. */
export const CHROME_BUILD = "131.0.6778.204";

const BROWSER_PATH_ENV = "FROGOE_BROWSER_PATH";
const CACHE_ROOT = path.join(cacheBase(process.platform, process.env, homedir()), "frogoe");
const CACHE_DIR = path.join(CACHE_ROOT, "chrome");

/** sha256 of each pinned chrome-headless-shell archive, computed from the
 *  exact bytes storage.googleapis.com serves (never guessed). Pass as
 *  install()'s expectedHash so a tampered or silently corrupted download
 *  fails loudly instead of executing. Keys are BrowserPlatform VALUES
 *  (what detectBrowserPlatform returns — e.g. mac_arm, not the CDN's
 *  mac-arm64 folder). Regenerate on a build bump:
 *    for p in linux64 mac-arm64 mac-x64 win32 win64; do
 *      curl -s "https://storage.googleapis.com/chrome-for-testing-public/<build>/$p/chrome-headless-shell-$p.zip" | shasum -a 256
 *    done */
export const ARCHIVE_CHECKSUMS: Readonly<Record<string, string>> = {
  linux: "afaac86e302c4874245991a3d509d529c50ecdd447affff0cdc2b08520906c32",
  mac: "933463c27a951d3fc153c408c4b8a96c89b9344379963f68a5ff9aa1718bcaf9",
  mac_arm: "9dae11ffda8d77f92c56f64de84f81fa6781c9d41235a8e9397117d7d004a017",
  win32: "e1a14441accf82785fd81b78d34d8faf5cc78bbab6b2f90fa7e7e972d93ed77f",
  win64: "d45834686f461ef6f487c0eacc2063bc311a5de86e92de46600895bf44136714",
};

const messageOf = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "";
};

/** Positive-integer env parsing with a teaching error on garbage — a
 *  typo'd timeout must fail loudly, never silently fall back to a
 *  default the user did not choose (and never to 0 = "forever"). */
export const positiveIntEnv = (name: string, raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const trimmed = raw.trim();
  if (!/^\d+$/u.test(trimmed) || Number.parseInt(trimmed, 10) <= 0) {
    throw new Error(
      `frogoe browser: ${name} must be a positive integer of milliseconds (got "${raw}") — unset it or fix the value, then re-run`,
    );
  }
  return Number.parseInt(trimmed, 10);
};

/** True when the failure is a corrupt/truncated archive or an incomplete
 *  extraction — states a purge + re-download can actually fix. Network
 *  errors and platform gaps are NOT corruption: retrying them blindly
 *  just burns bandwidth before the same teaching error. Message-matching
 *  (not instanceof) so it still works through the "All providers
 *  failed" aggregate wrapper. */
export const isCorruptInstallError = (error: unknown): boolean => {
  const message = messageOf(error).toLowerCase();
  return (
    message.includes("end of central directory") ||
    message.includes("end-of-central-directory") ||
    message.includes("invalid or corrupt") ||
    message.includes("corrupt zip") ||
    message.includes("corrupted") ||
    message.includes("not a zip") ||
    message.includes("unexpected end of") ||
    message.includes("integrity check failed") ||
    message.includes("exists but the executable")
  );
};

/** A real Chrome location per platform, for error messages that teach. */
export const browserPathHintForPlatform = (platform: NodeJS.Platform): string => {
  if (platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "/usr/bin/google-chrome";
};

/** Every wrapped browser error starts with "frogoe browser:" so the CLI's
 *  teaching-error boundary (cli.ts) prints message-only — agents read the
 *  fix, not a minified stack. */
export const wrapDownloadFailure = (cause: unknown): Error => {
  const original = messageOf(cause) || String(cause);
  return new Error(
    `frogoe browser: failed to download chrome-headless-shell ${CHROME_BUILD} — ${original}\n\n` +
      "Point frogoe at an already-installed Chrome/Chromium instead:\n\n" +
      `  export ${BROWSER_PATH_ENV}="${browserPathHintForPlatform(process.platform)}"\n\n` +
      "Then re-run your command. Any Chrome build works for the sandbox; the pinned\n" +
      `headless-shell re-downloads into ${CACHE_DIR} once the network allows.`,
    { cause: cause instanceof Error ? cause : undefined },
  );
};

const isTimeoutError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  return error.name === "TimeoutError" || /timed out \d+ ms/u.test(error.message);
};

/** Launch failures name their knobs: the timeout env (with a concrete
 *  doubled value to try) or the browser-path escape hatch. */
export const wrapLaunchFailure = (cause: unknown, timeoutMs: number): Error => {
  const head = isTimeoutError(cause)
    ? `frogoe browser: headless chrome did not start within ${String(timeoutMs)} ms.\n\n` +
      "Raise the budget or point frogoe at an installed Chrome:\n\n" +
      `  FROGOE_LAUNCH_TIMEOUT_MS=${String(timeoutMs * 2)} <your command>\n` +
      `  export ${BROWSER_PATH_ENV}="${browserPathHintForPlatform(process.platform)}"\n`
    : `frogoe browser: headless chrome failed to launch — ${messageOf(cause) || String(cause)}\n\n` +
      "If a local Chrome exists, point frogoe at it:\n\n" +
      `  export ${BROWSER_PATH_ENV}="${browserPathHintForPlatform(process.platform)}"\n`;
  return new Error(
    `${head}\nThen re-run your command. (The pinned binary lives in ${CACHE_DIR} —\nsee skills/frogoe-cli → references/live-sandbox.md)`,
    { cause: cause instanceof Error ? cause : undefined },
  );
};

export interface CacheLookup {
  executablePath?: string;
  /** install root to purge when the folder exists but the executable is
   *  missing — an interrupted extraction that wedges every future
   *  install() until someone deletes it by hand */
  staleInstallPath?: string;
}

/** Resolve the pinned build inside a cache dir through @puppeteer/
 *  browsers' own layout scanner, verifying the executable actually
 *  exists (getInstalledBrowsers reports folder-shape, not health). */
export const findInCache = async (cacheDir: string, buildId: string): Promise<CacheLookup> => {
  if (!existsSync(cacheDir)) return {};
  const { Browser, detectBrowserPlatform, getInstalledBrowsers } =
    await import("@puppeteer/browsers");
  const platform = detectBrowserPlatform();
  const match = (await getInstalledBrowsers({ cacheDir })).find(
    (entry) =>
      entry.browser === Browser.CHROMEHEADLESSSHELL &&
      entry.buildId === buildId &&
      entry.platform === platform,
  );
  if (!match) return {};
  if (existsSync(match.executablePath)) return { executablePath: match.executablePath };
  return { staleInstallPath: match.path };
};

/** Where the pre-global-cache CLI versions cached the browser (per project). */
export const legacyCacheDir = (dir: string): string =>
  path.resolve(dir, "node_modules", ".frogoe-browser");

/** One-time: move a legacy per-project install into the global cache so
 *  existing machines don't re-download ~100 MB. Falls back to download
 *  on ANY failure — migration is an optimization, never a blocker. */
export const migrateLegacyCache = async (
  legacyDir: string,
  cacheDir: string,
  buildId: string,
  log?: (line: string) => void,
): Promise<string | null> => {
  if (!existsSync(legacyDir)) return null;
  const { Browser, getInstalledBrowsers } = await import("@puppeteer/browsers");
  const legacy = (await getInstalledBrowsers({ cacheDir: legacyDir })).find(
    (entry) =>
      entry.browser === Browser.CHROMEHEADLESSSHELL &&
      entry.buildId === buildId &&
      existsSync(entry.executablePath),
  );
  if (!legacy) return null;
  const browserRootName = path.basename(path.dirname(legacy.path)); // chrome-headless-shell
  const installName = path.basename(legacy.path); // <platform>-<buildId>
  const destination = path.join(cacheDir, browserRootName, installName);
  mkdirSync(path.dirname(destination), { recursive: true });
  rmSync(destination, { recursive: true, force: true });
  try {
    try {
      renameSync(legacy.path, destination); // same volume: instant, atomic
    } catch (error) {
      if (!isErrno(error, "EXDEV")) throw error;
      // cross volume: stage INSIDE the cache so the final rename is a
      // same-volume atomic swap — concurrent readers never see a
      // half-copied install
      const staging = `${destination}.migrating-${String(process.pid)}`;
      rmSync(staging, { recursive: true, force: true });
      try {
        cpSync(legacy.path, staging, { recursive: true });
        renameSync(staging, destination);
      } finally {
        rmSync(staging, { recursive: true, force: true });
      }
      rmSync(legacy.path, { recursive: true, force: true });
    }
  } catch {
    return null;
  }
  const found = await findInCache(cacheDir, buildId);
  if (!found.executablePath) return null;
  // prune the legacy tree so node_modules stops carrying the dead weight
  // (recursive rm — a plain rm refuses directories even when empty)
  rmSync(path.dirname(legacy.path), { recursive: true, force: true });
  rmSync(legacyDir, { recursive: true, force: true });
  log?.(`  browser: migrated the cached chrome-headless-shell into ${cacheDir} (one-time)`);
  return found.executablePath;
};

/** Delete a superseded legacy cache once the global one resolves — the
 *  per-project copies are frogoe-owned caches, not user data. Removes a
 *  dir that holds OUR pinned build, or one already emptied by a past
 *  migration (a root shell in node_modules is litter); foreign content
 *  is left untouched. True when something was removed. */
export const pruneLegacyCache = (legacyDir: string, buildId: string): boolean => {
  if (!existsSync(legacyDir)) return false;
  try {
    const browserRoot = path.join(legacyDir, "chrome-headless-shell");
    if (existsSync(browserRoot)) {
      const entries = readdirSync(browserRoot);
      // content that is neither ours nor empty is foreign — keep it
      if (entries.length > 0 && !entries.some((name) => name.endsWith(`-${buildId}`))) {
        return false;
      }
    } else if (readdirSync(legacyDir).length > 0) {
      return false; // foreign content we never wrote
    }
    rmSync(legacyDir, { recursive: true, force: true });
    return true;
  } catch {
    return false; // never let hygiene break the run
  }
};

/** Download progress that respects both worlds: a live terminal gets an
 *  in-place updating line; a piped agent stream gets at most four
 *  milestone lines (token-friendly). stderr only — `check --json`
 *  stdout must stay machine-clean. */
const progressReporter = (): ((downloadedBytes: number, totalBytes: number) => void) => {
  const tty = process.stderr.isTTY === true;
  const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);
  let lastPaintMs = 0;
  let nextMilestone = 0.25;
  return (downloaded, total) => {
    if (tty) {
      const finished = total > 0 && downloaded >= total;
      if (Date.now() - lastPaintMs < 100 && !finished) return;
      lastPaintMs = Date.now();
      process.stderr.write(
        `\r  browser: downloading chrome-headless-shell — ${mb(downloaded)}${total > 0 ? `/${mb(total)}` : ""} MB`,
      );
      if (finished) process.stderr.write("\n");
      return;
    }
    if (total <= 0 || downloaded / total < nextMilestone) return;
    process.stderr.write(
      `  browser: downloading chrome-headless-shell — ${Math.round(nextMilestone * 100)}% (${mb(total)} MB)\n`,
    );
    nextMilestone += 0.25;
  };
};

const downloadBrowser = async (log: (line: string) => void): Promise<string> => {
  const { Browser, detectBrowserPlatform, install } = await import("@puppeteer/browsers");
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw wrapDownloadFailure(
      new Error(`no chrome-headless-shell build exists for ${process.platform}/${process.arch}`),
    );
  }
  const expectedHash = ARCHIVE_CHECKSUMS[platform];
  if (expectedHash === undefined) {
    log(
      `  browser: no pinned checksum for ${platform} — downloading WITHOUT integrity verification`,
    );
  }
  const runInstall = () =>
    install({
      browser: Browser.CHROMEHEADLESSSHELL,
      buildId: CHROME_BUILD,
      cacheDir: CACHE_DIR,
      unpack: true,
      ...(expectedHash === undefined ? {} : { expectedHash }),
      downloadProgressCallback: progressReporter(),
    });
  try {
    return (await runInstall()).executablePath;
  } catch (error) {
    if (!isCorruptInstallError(error)) throw wrapDownloadFailure(error);
    // a truncated archive (ctrl-C mid-download, AV lock, sleep/wake)
    // hard-blocks every future install until cleared — purge + retry once
    log("  browser: cached archive was corrupt — purging and retrying once…");
    rmSync(CACHE_DIR, { recursive: true, force: true });
    try {
      return (await runInstall()).executablePath;
    } catch (retryError) {
      // a second corruption propagates — no infinite retry
      throw wrapDownloadFailure(retryError);
    }
  }
};

export interface EnsureBrowserOptions {
  /** legacy per-project caches to migrate from / prune (game dir + cwd) */
  legacyDirs?: readonly string[];
}

let resolved: string | undefined;

/** Resolve the sandbox executable. Order: explicit env override (fails
 *  loudly if the path is wrong — a silent download would hide the
 *  user's mistake), global cache, lock-guarded {re-check → purge stale
 *  → migrate legacy → download}. */
export const ensureBrowser = async (options?: EnsureBrowserOptions): Promise<string> => {
  if (resolved) return resolved;
  const log = (line: string): void => console.error(line);
  const fromEnv = process.env[BROWSER_PATH_ENV]?.trim();
  if (fromEnv !== undefined && fromEnv !== "") {
    if (!existsSync(fromEnv)) {
      throw new Error(
        `frogoe browser: ${BROWSER_PATH_ENV} is set but "${fromEnv}" does not exist — fix the path or unset the variable, then re-run`,
      );
    }
    resolved = fromEnv;
    return resolved;
  }
  const legacyDirs = options?.legacyDirs ?? [legacyCacheDir(process.cwd())];

  const pre = await findInCache(CACHE_DIR, CHROME_BUILD);
  if (pre.executablePath) {
    resolved = pre.executablePath;
  } else {
    resolved = await withInstallLock(
      async () => {
        // re-check under the lock: a concurrent invocation may have
        // finished installing while we waited — reuse, don't re-download
        const post = await findInCache(CACHE_DIR, CHROME_BUILD);
        if (post.executablePath) return post.executablePath;
        if (post.staleInstallPath) {
          log("  browser: incomplete install in the cache — purging before reinstalling…");
          rmSync(post.staleInstallPath, { recursive: true, force: true });
        }
        for (const legacyDir of legacyDirs) {
          const migrated = await migrateLegacyCache(legacyDir, CACHE_DIR, CHROME_BUILD, log);
          if (migrated) return migrated;
        }
        return downloadBrowser(log);
      },
      CACHE_ROOT,
      { log },
    );
  }
  // the global cache now owns the binary — superseded per-project copies
  // are pure dead weight (frogoe-owned caches, never user data)
  for (const legacyDir of legacyDirs) {
    if (pruneLegacyCache(legacyDir, CHROME_BUILD)) {
      log(`  browser: removed the superseded per-project cache at ${legacyDir}`);
    }
  }
  return resolved;
};
