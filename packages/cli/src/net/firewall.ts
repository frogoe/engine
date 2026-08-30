/** macOS application-firewall probe — read-only, best effort, never throws.
 *  The question that matters: does the firewall BLOCK the runtime that is
 *  serving right now (process.execPath)? Anything unreadable reads as
 *  "unknown" and never triggers the eager tunnel — no false alarms. */
import { execSync } from "node:child_process";

export type FirewallState = "blocked" | "off" | "open" | "unknown";

const run = (args: string): string | null => {
  try {
    return execSync(`/usr/libexec/ApplicationFirewall/socketfilterfw ${args}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
  } catch {
    return null;
  }
};

/** null = firewall on but this binary's status unreadable */
const binaryBlocked = (path: string): boolean | null => {
  const out = run(`--getappblocked "${path}"`);
  if (out === null) return null;
  if (/blocked/iu.test(out)) return true;
  if (/allowed/iu.test(out)) return false;
  return null;
};

export const probeFirewall = (): FirewallState => {
  if (process.platform !== "darwin") return "unknown";
  const globalState = run("--getglobalstate");
  if (globalState === null) return "unknown";
  const state = /firewall is (enabled|disabled)/iu.exec(globalState)?.[1]?.toLowerCase();
  if (state === "disabled") return "off";
  if (state !== "enabled") return "unknown";
  const blocked = binaryBlocked(process.execPath);
  if (blocked === null) return "unknown";
  return blocked ? "blocked" : "open";
};
