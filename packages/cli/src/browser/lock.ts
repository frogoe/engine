/** Cross-process install lock — a zero-dependency mutex built on the
 *  atomicity of mkdirSync(recursive: false): EEXIST means another
 *  process holds it, so two CLIs that both miss the cache cannot
 *  extract into the same target dir simultaneously (a race that leaves
 *  a binary which merely exists while missing bits a clean install
 *  sets). Ported from hyperframes packages/cli/src/browser/manager.ts
 *  with every load-bearing detail kept:
 *  - stale reclaim: a crashed installer's lock ages out (mtime) instead
 *    of deadlocking every future install;
 *  - heartbeat: a long download touches the lock so live installs are
 *    never mistaken for stale ones;
 *  - waiter notice: concurrent CLIs print that they are waiting instead
 *    of looking hung;
 *  - reclaim gate: stale-lock deletion is serialized so two waiters
 *    crossing the timeout at once cannot delete each other's
 *    freshly-acquired locks (mtime re-checked behind the gate). */
import { existsSync, mkdirSync, rmSync, statSync, utimesSync } from "node:fs";
import path from "node:path";

export interface LockTimings {
  /** a lock older than this is presumed abandoned (crashed installer) */
  heartbeatMs: number;
  pollMs: number;
  staleMs: number;
  /** how often a waiter announces itself */
  waitNoticeMs: number;
}

export const DEFAULT_LOCK_TIMINGS: LockTimings = {
  heartbeatMs: 15_000,
  pollMs: 200,
  staleMs: 120_000,
  waitNoticeMs: 10_000,
};

const LOCK_DIR_NAME = ".chrome.install.lock";
const RECLAIM_DIR_NAME = ".chrome.install.reclaim.lock";

/** Type-guarded errno read — no `as` casts under strict TS. */
export const isErrno = (error: unknown, code: string): boolean => {
  if (typeof error === "object" && error !== null && "code" in error) {
    return error.code === code;
  }
  return false;
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// recursive:false is load-bearing: throwing EEXIST on an existing dir is
// what turns mkdir into a mutex (`mkdir -p` would silently no-op).
const tryAcquireDirLock = (lockDir: string): boolean => {
  try {
    mkdirSync(lockDir, { recursive: false });
    return true;
  } catch (error) {
    if (!isErrno(error, "EEXIST")) throw error;
    return false;
  }
};

const isDirLockStale = (lockDir: string, staleMs: number): boolean => {
  try {
    return Date.now() - statSync(lockDir).mtimeMs > staleMs;
  } catch (error) {
    if (isErrno(error, "ENOENT")) return false;
    throw error;
  }
};

const touch = (lockDir: string): void => {
  try {
    const now = new Date();
    utimesSync(lockDir, now, now);
  } catch {
    // heartbeat is best-effort; stale reclaim remains the fallback
  }
};

/** Reclaim a stale main lock behind the reclaim gate. The gate
 *  serializes reclaimers; the mtime re-check after acquiring it
 *  prevents deleting a fresh lock another waiter just won. */
const reclaimStaleLock = (lockDir: string, reclaimDir: string, staleMs: number): void => {
  if (!tryAcquireDirLock(reclaimDir)) return;
  try {
    if (isDirLockStale(lockDir, staleMs)) {
      rmSync(lockDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(reclaimDir, { recursive: true, force: true });
  }
};

export interface InstallLockOptions {
  timings?: LockTimings;
  /** waiter notices go here (stderr in production, collector in tests) */
  log?: (line: string) => void;
}

/** Run `fn` while holding the install lock rooted at `rootDir`. The lock
 *  dirs live directly under `rootDir` (a level above the browser cache
 *  itself) so force-clearing the cache can never delete another
 *  installer's in-flight lock. */
export const withInstallLock = async <T>(
  fn: () => Promise<T>,
  rootDir: string,
  options?: InstallLockOptions,
): Promise<T> => {
  const timings = options?.timings ?? DEFAULT_LOCK_TIMINGS;
  const log = options?.log ?? ((line: string) => console.error(line));
  const lockDir = path.join(rootDir, LOCK_DIR_NAME);
  const reclaimDir = path.join(rootDir, RECLAIM_DIR_NAME);

  if (!existsSync(rootDir)) mkdirSync(rootDir, { recursive: true });
  let deadline = Date.now() + timings.staleMs;
  const waitStart = Date.now();
  let lastNoticeMs = 0;
  for (;;) {
    if (existsSync(reclaimDir)) {
      // a process can die holding the reclaim gate itself — without
      // aging that gate out, every future installer sleeps forever and
      // never even reaches the stale-lock path below
      if (isDirLockStale(reclaimDir, timings.staleMs)) {
        rmSync(reclaimDir, { recursive: true, force: true });
      }
      await sleep(timings.pollMs);
      continue;
    }
    if (tryAcquireDirLock(lockDir)) {
      rmSync(reclaimDir, { recursive: true, force: true });
      break;
    }
    const waitedMs = Date.now() - waitStart;
    if (waitedMs - lastNoticeMs >= timings.waitNoticeMs) {
      lastNoticeMs = waitedMs;
      log(
        `  browser: waiting for another frogoe process to finish installing chrome-headless-shell (${Math.round(waitedMs / 1000)}s elapsed)…`,
      );
    }
    if (isDirLockStale(lockDir, timings.staleMs) || Date.now() > deadline) {
      reclaimStaleLock(lockDir, reclaimDir, timings.staleMs);
      deadline = Date.now() + timings.staleMs;
      continue;
    }
    await sleep(timings.pollMs);
  }

  const heartbeat = setInterval(() => touch(lockDir), timings.heartbeatMs);
  if (typeof heartbeat.unref === "function") heartbeat.unref();
  try {
    return await fn();
  } finally {
    clearInterval(heartbeat);
    rmSync(lockDir, { recursive: true, force: true });
  }
};
