import { describe, expect, test } from "bun:test";
/** net/ decisions — pure functions with fabricated inputs. The tunnel
 *  process and firewall probe are thin shells around these; live network
 *  is never touched here. */
import path from "node:path";

import type { IfaceEntry } from "../src/net/ip.ts";
import { interfaceFromRouteOutput, isLoopback, pickLanIp, selfAddresses } from "../src/net/ip.ts";
import { lanRisky, planNudge, planStartup } from "../src/net/plan.ts";
import {
  assetName,
  binaryFileName,
  cacheBase,
  extractSingleFile,
  parseTunnelUrl,
} from "../src/net/tunnel.ts";

/** hand-rolled ustar archive: one 512B header block + padded data */
const tarOf = (name: string, content: Buffer): Buffer => {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf-8");
  header.write(content.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf-8");
  header.write("0000000\0", 148, 8, "utf-8"); // dummy checksum, not read
  header.write("0", 156, 1, "utf-8"); // regular file
  header.write("ustar\0", 257, 6, "utf-8");
  const data = Buffer.concat([
    content,
    Buffer.alloc(Math.ceil(content.length / 512) * 512 - content.length),
  ]);
  return Buffer.concat([header, data, Buffer.alloc(1024)]); // end-of-archive
};

const v4 = (address: string): IfaceEntry[] => [{ address, family: "IPv4", internal: false }];

const lan = (
  candidates: string[],
  confidence: "heuristic" | "none" | "routed",
  ip?: string,
  virtual = false,
) => ({ candidates, confidence, ip, virtual });

describe("pickLanIp", () => {
  test("the default-route interface wins over first-seen", () => {
    const table = {
      en1: v4("10.0.0.5"),
      en0: v4("192.168.0.5"),
      utun3: v4("10.2.0.1"),
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
    };
    const info = pickLanIp(table, "en0");
    expect(info.ip).toBe("192.168.0.5");
    expect(info.confidence).toBe("routed");
    expect(info.virtual).toBeFalse();
  });

  test("routed into a vpn interface is flagged virtual (phone can't reach it)", () => {
    const info = pickLanIp({ en0: v4("192.168.0.5"), utun4: v4("10.9.9.9") }, "utun4");
    expect(info.ip).toBe("10.9.9.9");
    expect(info.confidence).toBe("routed");
    expect(info.virtual).toBeTrue();
  });

  test("no route info: single physical interface, heuristic pick", () => {
    const info = pickLanIp({ en0: v4("192.168.1.2"), utun9: v4("147.3.3.3") }, null);
    expect(info.ip).toBe("192.168.1.2");
    expect(info.confidence).toBe("heuristic");
    expect(info.virtual).toBeFalse();
    expect(info.candidates).toEqual(["192.168.1.2"]);
  });

  test("no route info + two physical interfaces: ambiguous, sorted candidates", () => {
    const info = pickLanIp({ en7: v4("192.168.44.9"), en2: v4("10.1.1.1") }, null);
    expect(info.candidates).toEqual(["10.1.1.1", "192.168.44.9"]);
    expect(info.ip).toBe("10.1.1.1"); // deterministic: name-sorted first
  });

  test("virtual-only machine still gets a best-effort address", () => {
    const info = pickLanIp({ utun0: v4("10.5.5.5") }, null);
    expect(info.ip).toBe("10.5.5.5");
    expect(info.virtual).toBeTrue();
  });

  test("loopback, link-local, CGNAT and public addresses never qualify", () => {
    const info = pickLanIp(
      { en0: v4("169.254.4.4"), en1: v4("100.64.0.7"), en2: v4("8.8.8.8"), en3: v4("127.0.0.9") },
      null,
    );
    expect(info.confidence).toBe("none");
    expect(info.ip).toBeUndefined();
  });
});

describe("isLoopback", () => {
  test("matches every loopback form the server can see", () => {
    for (const addr of ["127.0.0.1", "127.9.9.9", "::1", "::ffff:127.0.0.1"]) {
      expect(isLoopback(addr)).toBeTrue();
    }
  });
  test("phones are not loopback", () => {
    for (const addr of ["192.168.0.42", "10.0.0.2", "172.20.1.5", "::ffff:192.168.0.42"]) {
      expect(isLoopback(addr)).toBeFalse();
    }
    expect(isLoopback(undefined)).toBeFalse();
  });
});

describe("parseTunnelUrl", () => {
  test("extracts the trycloudflare url from the cloudflared banner", () => {
    const stderr = [
      "2026-08-30T10:00:00Z INF +----------------------------------------------------+",
      "2026-08-30T10:00:00Z INF |  https://crazy-example-words.trycloudflare.com     |",
      "2026-08-30T10:00:00Z INF +----------------------------------------------------+",
    ].join("\n");
    expect(parseTunnelUrl(stderr)).toBe("https://crazy-example-words.trycloudflare.com");
  });
  test("url split across stream chunks still matches once buffered", () => {
    expect(parseTunnelUrl("prefix https://ab")).toBeUndefined();
    expect(parseTunnelUrl("prefix https://ab-cd-ef.trycloudflare.com tail")).toBe(
      "https://ab-cd-ef.trycloudflare.com",
    );
  });
  test("first match wins; no url is undefined", () => {
    expect(parseTunnelUrl("x https://one.trycloudflare.com y https://two.trycloudflare.com")).toBe(
      "https://one.trycloudflare.com",
    );
    expect(parseTunnelUrl("no urls here")).toBeUndefined();
  });
});

describe("extractSingleFile", () => {
  test("pulls the binary out of a ustar archive", () => {
    const tar = tarOf("cloudflared", Buffer.from("fake-binary-bytes"));
    expect(extractSingleFile(tar, "cloudflared")?.toString("utf-8")).toBe("fake-binary-bytes");
  });
  test("sizes past one block and exact-block boundaries round-trip", () => {
    const long = Buffer.alloc(1300, 7);
    expect(extractSingleFile(tarOf("cloudflared", long), "cloudflared")?.length).toBe(1300);
    const exact = Buffer.alloc(1024, 9);
    expect(extractSingleFile(tarOf("cloudflared", exact), "cloudflared")?.length).toBe(1024);
  });
  test("missing names and truncated archives read as null", () => {
    const tar = tarOf("other-file", Buffer.from("x"));
    expect(extractSingleFile(tar, "cloudflared")).toBeNull();
    expect(extractSingleFile(tar.subarray(0, 300), "other-file")).toBeNull();
  });
});

describe("selfAddresses", () => {
  test("collects v4, v6, and the ipv4-mapped v6 spelling", () => {
    const own = selfAddresses({
      en0: [
        { address: "192.168.0.200", family: "IPv4", internal: false },
        { address: "fe80::1c5b", family: "IPv6", internal: false },
      ],
      lo0: [
        { address: "127.0.0.1", family: "IPv4", internal: true },
        { address: "::1", family: "IPv6", internal: true },
      ],
    });
    expect(own.has("192.168.0.200")).toBeTrue();
    expect(own.has("::ffff:192.168.0.200")).toBeTrue();
    expect(own.has("fe80::1c5b")).toBeTrue();
    expect(own.has("127.0.0.1")).toBeTrue();
    expect(own.has("::1")).toBeTrue();
    expect(own.has("192.168.0.204")).toBeFalse(); // the phone is not us
  });
});

describe("platform coverage (tunnel binary + caches + route dialects)", () => {
  test("assetName: every supported platform/arch, and honest nulls", () => {
    expect(assetName("darwin", "arm64")).toBe("cloudflared-darwin-arm64.tgz");
    expect(assetName("darwin", "x64")).toBe("cloudflared-darwin-amd64.tgz");
    expect(assetName("darwin", "ia32")).toBeNull();
    expect(assetName("linux", "arm64")).toBe("cloudflared-linux-arm64");
    expect(assetName("linux", "x64")).toBe("cloudflared-linux-amd64");
    expect(assetName("win32", "x64")).toBe("cloudflared-windows-amd64.exe");
    expect(assetName("win32", "ia32")).toBe("cloudflared-windows-386.exe");
    expect(assetName("win32", "arm64")).toBeNull();
    expect(assetName("freebsd", "x64")).toBeNull();
    expect(assetName("darwin", "riscv64")).toBeNull();
  });
  test("binaryFileName: .exe exactly where it must be", () => {
    expect(binaryFileName("win32")).toBe("cloudflared.exe");
    expect(binaryFileName("darwin")).toBe("cloudflared");
    expect(binaryFileName("linux")).toBe("cloudflared");
  });
  test("cacheBase: platform conventions, with windows env fallback", () => {
    expect(cacheBase("darwin", {}, "/Users/x")).toBe("/Users/x/Library/Caches");
    expect(cacheBase("linux", {}, "/home/x")).toBe("/home/x/.cache");
    expect(
      cacheBase("win32", { LOCALAPPDATA: "C:\\Users\\x\\AppData\\Local" }, "C:\\Users\\x"),
    ).toBe("C:\\Users\\x\\AppData\\Local");
    // env absent → AppData/Local under home (path sep is per-runtime OS)
    expect(cacheBase("win32", {}, "/fake-home")).toBe(path.join("/fake-home", "AppData", "Local"));
  });
  test("interfaceFromRouteOutput: one parser per dialect", () => {
    expect(
      interfaceFromRouteOutput(
        "   route to: default\ndestination: default\n    interface: en0\n",
        "bsd",
      ),
    ).toBe("en0");
    expect(interfaceFromRouteOutput("default via 192.168.0.1 dev wlp3s0 proto dhcp", "linux")).toBe(
      "wlp3s0",
    );
    expect(interfaceFromRouteOutput("\r\nWi-Fi 2\r\n", "windows")).toBe("Wi-Fi 2");
    expect(interfaceFromRouteOutput("no match here", "bsd")).toBeUndefined();
  });
  test("windows virtual adapter names never become the lan QR", () => {
    const table = {
      "vEthernet (Default Switch)": v4("192.168.44.1"),
      "VirtualBox Host-Only Ethernet Adapter": v4("192.168.99.1"),
      "VMware Network Adapter VMnet1": v4("192.168.31.1"),
      "Wi-Fi 2": v4("192.168.0.77"),
    };
    const info = pickLanIp(table, "Wi-Fi 2");
    expect(info.ip).toBe("192.168.0.77");
    expect(info.confidence).toBe("routed");
    expect(info.virtual).toBeFalse();
    // without the route hint, the virtual adapters still never win
    const heur = pickLanIp(table, null);
    expect(heur.ip).toBe("192.168.0.77");
    expect(heur.virtual).toBeFalse();
  });
});

describe("planStartup", () => {
  const cleanLan = lan(["192.168.0.5"], "routed", "192.168.0.5");

  test("--tunnel always starts the tunnel eagerly", () => {
    expect(planStartup(cleanLan, "open", true).eagerTunnel).toBeTrue();
  });
  test("clean routed lan + firewall off/open: lan only", () => {
    for (const fw of ["off", "open", "unknown"] as const) {
      const plan = planStartup(cleanLan, fw, false);
      expect(plan.eagerTunnel).toBeFalse();
      expect(plan.notes).toEqual([]);
    }
  });
  test("no lan address: tunnel is the only path", () => {
    const plan = planStartup(lan([], "none"), "off", false);
    expect(plan.eagerTunnel).toBeTrue();
    expect(plan.notes[0]).toContain("no lan address");
  });
  test("firewall blocking the runtime: eager tunnel + fix hint", () => {
    const plan = planStartup(cleanLan, "blocked", false);
    expect(plan.eagerTunnel).toBeTrue();
    expect(plan.notes[0]).toContain("firewall");
  });
  test("risky lan (vpn-routed / ambiguous): eager tunnel", () => {
    for (const risky of [
      lan(["10.9.9.9"], "routed", "10.9.9.9", true),
      lan(["10.1.1.1", "192.168.44.9"], "heuristic", "10.1.1.1"),
      lan(["10.5.5.5"], "heuristic", "10.5.5.5", true),
    ]) {
      expect(lanRisky(risky)).toBeTrue();
      expect(planStartup(risky, "off", false).eagerTunnel).toBeTrue();
    }
  });
});

describe("planNudge", () => {
  test("a connected phone silences the nudge", () => {
    expect(planNudge(true, false)).toBeNull();
  });
  test("a running tunnel silences the nudge", () => {
    expect(planNudge(false, true)).toBeNull();
  });
  test("silence never: hint once for the invisible failures (ap isolation)", () => {
    expect(planNudge(false, false)).toBe("hint");
  });
});
