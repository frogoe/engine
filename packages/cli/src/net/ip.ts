/** LAN address resolution — pick the interface the default route uses,
 *  not "the first IPv4 we saw". The first-seen heuristic is the bug that
 *  ships VirtualBox/VPN addresses in QR codes (it plagued Expo SDK 53);
 *  the default route is the network the machine actually talks on. */
import { execSync } from "node:child_process";
import os from "node:os";

export type LanConfidence = "heuristic" | "none" | "routed";

export interface IfaceEntry {
  address: string;
  family: string;
  internal: boolean;
}

export interface LanInfo {
  /** usable physical candidates, name-sorted (diagnostics for the banner) */
  candidates: string[];
  confidence: LanConfidence;
  /** best-effort address; absent when confidence === "none" */
  ip?: string;
  /** the chosen address lives on a virtual interface (vpn, docker, …) */
  virtual: boolean;
}

/** interface names that never carry the wifi/ethernet the phone is on.
 *  macOS/Linux: utun, awdl, vboxnet…  Windows: vEthernet (Hyper-V/WSL),
 *  VirtualBox Host-Only, VMware VMnet. Matched lowercased. */
const VIRTUAL =
  /^(?:utun|awdl|llw|bridge|vboxnet|veth|docker|zd|zt|tailscale|tap|tun|anpi|ipsec|gif|stf|vethernet|virtualbox|vmware|vmnet|wsl|loopback|bluetooth)/u;

const isPrivateV4 = (ip: string): boolean => {
  const octets = ip.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a = -1, b = -1] = octets;
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  return false; // loopback, link-local, CGNAT, public — not a phone-lan address
};

export const isLoopback = (addr: string | undefined): boolean => {
  if (!addr) return false;
  return addr === "::1" || addr.startsWith("127.") || addr.startsWith("::ffff:127.");
};

/** Pure: every address this machine answers on — v4, v6, and the
 *  ipv4-mapped v6 spelling, so a self-curl over the lan ip never reads
 *  as "a phone connected". */
export const selfAddresses = (
  interfaces: Readonly<Record<string, readonly IfaceEntry[] | undefined>>,
): Set<string> => {
  const own = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4") {
        own.add(entry.address);
        own.add(`::ffff:${entry.address}`);
      } else if (entry.family === "IPv6") {
        own.add(entry.address);
      }
    }
  }
  return own;
};

/** Pure: given interface tables and the routed interface name, choose the
 *  lan address. Tested directly with fabricated tables. */
export const pickLanIp = (
  interfaces: Readonly<Record<string, readonly IfaceEntry[] | undefined>>,
  routedName: string | null,
): LanInfo => {
  const physical: Array<{ ip: string; name: string }> = [];
  const virtual: Array<{ ip: string; name: string }> = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal || !isPrivateV4(entry.address)) continue;
      const item = { ip: entry.address, name };
      if (VIRTUAL.test(name.toLowerCase())) virtual.push(item);
      else physical.push(item);
    }
  }
  physical.sort((a, b) => a.name.localeCompare(b.name));
  virtual.sort((a, b) => a.name.localeCompare(b.name));

  if (routedName) {
    const routed =
      physical.find((p) => p.name === routedName) ?? virtual.find((v) => v.name === routedName);
    if (routed) {
      // routed into a vpn interface is still "routed" — but flagged virtual,
      // because the phone usually can't reach it (drives the tunnel nudge)
      return {
        candidates: [routed.ip],
        confidence: "routed",
        ip: routed.ip,
        virtual: !physical.includes(routed),
      };
    }
  }
  const chosen = physical[0] ?? virtual[0];
  if (!chosen) {
    return { candidates: [], confidence: "none", virtual: false };
  }
  return {
    candidates: physical.length > 0 ? physical.map((p) => p.ip) : virtual.map((v) => v.ip),
    confidence: "heuristic",
    ip: chosen.ip,
    virtual: !physical.includes(chosen),
  };
};

export type RouteStyle = "bsd" | "linux" | "windows";

/** Pure: pull the interface name out of a route dump, per dialect. */
export const interfaceFromRouteOutput = (output: string, style: RouteStyle): string | undefined => {
  if (style === "bsd") return /interface:\s*(\S+)/u.exec(output)?.[1];
  if (style === "linux") return /dev\s+(\S+)/u.exec(output)?.[1];
  // windows powershell prints the bare InterfaceAlias, \r and all
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
};

const ROUTE_PROBES: ReadonlyArray<{ cmd: string; style: RouteStyle }> = [
  { cmd: "route -n get default", style: "bsd" }, // darwin/bsd; usage-errors elsewhere
  { cmd: "ip route show default", style: "linux" }, // linux; absent on darwin/win
  {
    cmd: "powershell -NoProfile -Command \"(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Sort-Object RouteMetric | Select-Object -First 1).InterfaceAlias\"",
    style: "windows",
  },
];

/** Impure: the interface name the OS default route uses (darwin, linux,
 *  windows). Probes run in order; each cheap-fails where it doesn't apply. */
export const routedInterfaceName = (): string | null => {
  for (const probe of ROUTE_PROBES) {
    try {
      const out = execSync(probe.cmd, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3000,
      });
      const name = interfaceFromRouteOutput(out, probe.style);
      if (name) return name;
    } catch {
      // no default route / command absent — fall through to the next probe
    }
  }
  return null;
};

/** Impure: full lan resolution for this machine, right now. */
export const resolveLan = (): LanInfo => pickLanIp(os.networkInterfaces(), routedInterfaceName());
