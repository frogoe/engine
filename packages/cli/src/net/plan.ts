/** run-command decisions — pure. Given lan/firewall facts, decide what the
 *  banner prints and whether the tunnel starts eagerly. The command layer
 *  only executes; every branch here is unit-tested. */
import type { FirewallState } from "./firewall.ts";
import type { LanInfo } from "./ip.ts";

export type NudgePlan = "hint" | null;

/** the lan QR is suspect: vpn-routed, ambiguous networks, or no lan at all */
export const lanRisky = (lan: LanInfo): boolean =>
  lan.confidence === "none" ||
  lan.virtual ||
  (lan.confidence === "heuristic" && lan.candidates.length > 1);

export interface StartupPlan {
  /** start the tunnel before the first QR is printed */
  eagerTunnel: boolean;
  /** banner notes, printed under the URLs */
  notes: string[];
}

export const planStartup = (
  lan: LanInfo,
  firewall: FirewallState,
  tunnelFlag: boolean,
): StartupPlan => {
  if (tunnelFlag) return { eagerTunnel: true, notes: [] };
  if (lan.confidence === "none") {
    return {
      eagerTunnel: true,
      notes: ["no lan address found — the tunnel is the only phone path"],
    };
  }
  if (firewall === "blocked") {
    return {
      eagerTunnel: true,
      notes: [
        "macos firewall blocks incoming connections for this runtime — System Settings → Network → Firewall → Options → Allow, or rely on the tunnel",
      ],
    };
  }
  if (lanRisky(lan)) {
    return {
      eagerTunnel: true,
      notes: [
        "uncertain lan address (vpn or multiple networks) — if the phone can't load the lan QR, use the tunnel",
      ],
    };
  }
  return { eagerTunnel: false, notes: [] };
};

/** The 10s nudge: only fires when no phone ever connected AND no tunnel is
 *  running. Risky conditions were handled eagerly at startup, so the nudge
 *  is a text hint — enough for the invisible failure (AP isolation, guest
 *  ssid) without surprising anyone with a spawned process. */
export const planNudge = (sawRemote: boolean, tunnelRunning: boolean): NudgePlan =>
  sawRemote || tunnelRunning ? null : "hint";
