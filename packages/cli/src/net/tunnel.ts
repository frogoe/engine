/** Quick Tunnel (cloudflared) — a public URL for the dev server, no account,
 *  no config: `cloudflared tunnel --url http://localhost:PORT` prints a
 *  random *.trycloudflare.com subdomain on stderr. Quick tunnels do NOT
 *  pass SSE — the injected reload script polls /__frogoe/version as its
 *  universal fallback, so live reload survives every proxy.
 *
 *  Binary lifecycle is owned, not wrapped: the npm wrapper downloads
 *  silently into evaporating caches and orphans grandchildren, so we
 *  resolve cloudflared as PATH → version-pinned cache download. */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Readable } from "node:stream";

const URL_PATTERN = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/iu;

export const parseTunnelUrl = (chunk: string): string | undefined => URL_PATTERN.exec(chunk)?.[0];

// cloudflared release tags look like 2025.10.1 or 2025.10.1-a — strict
// charset, no path or shell metacharacters. The tag is attacker-reachable
// (FROGOE_CLOUDFLARED_VERSION env pin, or a hostile github-api response)
// and everything downstream derives from it — cache dir, download URL, and
// ultimately the spawned EXECUTABLE path — so it is validated before it
// touches any of those (CodeQL: js/command-line-injection).
const TAG_PATTERN = /^\d{4}\.\d+\.\d+(-[A-Za-z0-9.]+)?$/u;

export const assertSafeTag = (tag: string): string => {
  if (!TAG_PATTERN.test(tag)) {
    throw new Error(
      `cloudflared version "${tag}" is not a valid release tag (expected e.g. 2025.10.1)`,
    );
  }
  return tag;
};

// ——— tar (ustar) single-file extraction — no dependency for one file ———

const octalAt = (block: Buffer, offset: number, length: number): number => {
  const raw = block.subarray(offset, offset + length).toString("utf-8");
  const digits = raw.replace(/[\0 ]/gu, "");
  return digits.length === 0 ? 0 : Number.parseInt(digits, 8);
};

/** Extract one regular file from an uncompressed ustar archive. */
export const extractSingleFile = (tar: Buffer, wanted: string): Buffer | null => {
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf-8").replace(/\0.*$/u, "");
    const size = octalAt(header, 124, 12);
    const type = header.toString("utf-8").charCodeAt(156);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;
    if (dataEnd > tar.length) return null;
    if (name === wanted && (type === 48 || type === 0)) {
      return tar.subarray(dataStart, dataEnd);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
};

// ——— binary resolution: PATH → pinned cache download ———

const ENV_PIN = "FROGOE_CLOUDFLARED_VERSION"; // unset → resolve "latest" once via github, cached by tag

/** Pure: the release asset for a platform/arch, or null where cloudflared
 *  publishes none (the caller then requires a PATH install instead). */
export const assetName = (platform: NodeJS.Platform, arch: string): string | null => {
  const a = arch === "arm64" ? "arm64" : arch === "x64" ? "amd64" : arch === "ia32" ? "386" : null;
  if (!a) return null;
  switch (platform) {
    case "darwin":
      return a === "386" ? null : `cloudflared-darwin-${a}.tgz`;
    case "linux":
      return `cloudflared-linux-${a}`; // bare binaries
    case "win32":
      return a === "arm64" ? null : `cloudflared-windows-${a}.exe`; // bare executables
    default:
      return null;
  }
};

/** Pure: what the cached binary is called on this platform. */
export const binaryFileName = (platform: NodeJS.Platform): string =>
  platform === "win32" ? "cloudflared.exe" : "cloudflared";

/** Pure: the platform's conventional user cache base. */
export const cacheBase = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string => {
  if (platform === "darwin") return path.join(home, "Library", "Caches");
  if (platform === "win32") return env.LOCALAPPDATA ?? path.join(home, "AppData", "Local");
  return path.join(home, ".cache");
};

const resolveLatestTag = async (): Promise<string> => {
  const res = await fetch("https://api.github.com/repos/cloudflare/cloudflared/releases/latest", {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`github api ${res.status}`);
  const body = (await res.json()) as { tag_name?: string };
  if (!body.tag_name) throw new Error("github api returned no tag_name");
  return body.tag_name;
};

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(0);

const downloadWithProgress = async (
  res: Response,
  onChunk: (done: number, total: number) => void,
): Promise<Buffer> => {
  const total = Number(res.headers.get("content-length") ?? 0);
  const reader = res.body?.getReader();
  if (!reader) return Buffer.from(await res.arrayBuffer());
  const chunks: Buffer[] = [];
  let done = 0;
  let nextReport = 0;
  for (;;) {
    const step = await reader.read();
    if (step.done) break;
    chunks.push(Buffer.from(step.value));
    done += step.value.byteLength;
    if (done >= nextReport) {
      onChunk(done, total);
      nextReport = done + 5 * 1024 * 1024; // a line every ~5 MB
    }
  }
  return Buffer.concat(chunks);
};

/** runs `bin --version` and requires the echo to contain the tag — a wrong
 *  or corrupted download never executes as a tunnel. */
const binaryEchoes = (bin: string, tag: string): boolean => {
  try {
    const probe = spawnSync(bin, ["--version"], { encoding: "utf-8", timeout: 10_000 });
    const out = `${probe.stdout ?? ""}${probe.stderr ?? ""}`;
    return probe.status === 0 && out.includes(tag);
  } catch {
    return false;
  }
};

export interface TunnelBinary {
  /** true when this call downloaded it (for the progress line) */
  downloaded: boolean;
  path: string;
}

/** PATH first (brew-managed machines skip our cache entirely). */
export const resolveBinary = async (onProgress?: (line: string) => void): Promise<TunnelBinary> => {
  const pathProbe = spawnSync("cloudflared", ["--version"], { stdio: "ignore", timeout: 5000 });
  if (pathProbe.status === 0) return { downloaded: false, path: "cloudflared" };

  const platform = process.platform;
  const asset = assetName(platform, process.arch);
  if (!asset) {
    throw new Error(
      `cloudflared publishes no build for ${platform}/${process.arch} — install it and put \`cloudflared\` on PATH`,
    );
  }

  const tag = process.env[ENV_PIN]
    ? assertSafeTag(process.env[ENV_PIN])
    : assertSafeTag(await resolveLatestTag());
  const root = path.join(cacheBase(platform, process.env, os.homedir()), "frogoe", "cloudflared");
  const dir = path.join(root, tag);
  const bin = path.join(dir, binaryFileName(platform));
  // defense in depth: even with a validated tag, the executable must resolve
  // INSIDE the cache root it was built from — never execute an escaped path
  const rootResolved = path.resolve(root);
  const binResolved = path.resolve(bin);
  if (!binResolved.startsWith(rootResolved + path.sep)) {
    throw new Error("cloudflared binary path escaped the frogoe cache — refusing to execute");
  }
  if (existsSync(bin) && binaryEchoes(bin, tag)) return { downloaded: false, path: bin };

  onProgress?.(`downloading cloudflared ${tag} (~25 MB, once)…`);
  const res = await fetch(
    `https://github.com/cloudflare/cloudflared/releases/download/${tag}/${asset}`,
  );
  if (!res.ok) throw new Error(`cloudflared ${tag} download failed (${res.status})`);
  const raw = await downloadWithProgress(res, (done, total) => {
    onProgress?.(`downloading cloudflared ${tag} — ${mb(done)}${total ? `/${mb(total)}` : ""} MB`);
  });
  const binary = asset.endsWith(".tgz") ? extractSingleFile(gunzipSync(raw), "cloudflared") : raw;
  if (!binary) throw new Error("cloudflared archive did not contain the binary");
  mkdirSync(dir, { recursive: true });
  writeFileSync(bin, binary);
  if (platform !== "win32") chmodSync(bin, 0o755);
  if (!binaryEchoes(bin, tag)) {
    throw new Error(
      `cloudflared ${tag} failed its version check — deleted; set ${ENV_PIN} or install via brew`,
    );
  }
  return { downloaded: true, path: bin };
};

// ——— the tunnel itself ———

export interface TunnelHandle {
  /** resolves when the cloudflared process is gone (watch for disconnects) */
  exited: Promise<void>;
  stop: () => void;
  url: string;
}

export interface TunnelOptions {
  /** give up if no URL appears within ms (default 20s) */
  timeoutMs?: number;
  /** see resolveBinary */
  onProgress?: (line: string) => void;
}

export const startTunnel = async (port: number, options?: TunnelOptions): Promise<TunnelHandle> => {
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const bin = await resolveBinary(options?.onProgress);

  return new Promise<TunnelHandle>((resolve, reject) => {
    // detached → its own process group: stop() kills the whole tree, no
    // orphans (the npm-wrapper lesson). windowsHide keeps headless even
    // when windows gives the detached child its own console.
    const child = spawn(
      bin.path,
      ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"],
      {
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let settled = false;
    let url: string | undefined;
    let buffer = "";

    const exited = new Promise<void>((notify) => {
      child.once("exit", () => notify());
    });

    const killTree = (): void => {
      // negative-pid group kill is posix-only; on windows the direct child
      // IS cloudflared (we spawn the binary, never a wrapper), so a plain
      // kill reaches it
      if (process.platform === "win32" || !child.pid) {
        child.kill("SIGTERM");
        return;
      }
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    };

    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error || !url) {
        killTree();
        const tail = buffer
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(-2)
          .join(" | ");
        const base = error?.message ?? "frogoe tunnel: cloudflared exited before producing a URL";
        reject(new Error(tail ? `${base} — ${tail}` : base));
        return;
      }
      resolve({ exited, stop: killTree, url });
    };

    const timer = setTimeout(() => {
      finish(
        new Error(
          `frogoe tunnel: no URL from cloudflared within ${timeoutMs / 1000}s — check your internet, or brew install cloudflared`,
        ),
      );
    }, timeoutMs);

    child.once("exit", (code) => {
      if (!settled) {
        finish(new Error(`frogoe tunnel: cloudflared exited early (code ${code ?? "signal"})`));
      }
    });

    const watch = (stream: Readable): void => {
      stream.on("data", (data: Buffer) => {
        if (settled && url) return; // keep draining, stop parsing
        buffer += data.toString("utf-8");
        const found = parseTunnelUrl(buffer);
        if (found && !url) {
          url = found;
          finish();
        }
      });
    };
    if (child.stderr && child.stdout) {
      watch(child.stderr);
      watch(child.stdout);
    }
  });
};
