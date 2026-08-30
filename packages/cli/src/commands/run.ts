/** frogoe run command — UX orchestration over the DevServer:
 *  banner + QRs, firewall probe, eager tunnel for risky lans, a 10s
 *  no-phone nudge, and clean ctrl+c teardown. All decisions live in
 *  net/plan.ts (pure); this layer only executes and prints. */
import { defineCommand } from "citty";

import { probeFirewall } from "../net/firewall.ts";
import { resolveLan } from "../net/ip.ts";
import { planNudge, planStartup } from "../net/plan.ts";
import { startTunnel, type TunnelHandle } from "../net/tunnel.ts";
import { startServer } from "../run.ts";

const NUDGE_MS = 10_000;

const printQr = (url: string): void => {
  void import("qrcode-terminal")
    .then((mod) => {
      // CJS interop: named exports are not statically detected under node
      const qrcode = (mod as unknown as { default?: typeof mod }).default ?? mod;
      qrcode.generate(url, { small: true }, (qr: string) => console.log(qr));
    })
    .catch(() => {
      console.log(`  (qr unavailable — open ${url} directly)`);
    });
};

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const command = defineCommand({
  args: {
    dir: { type: "positional", required: false, description: "game folder (default: cwd)" },
    port: { type: "string", description: "port (default: random free)" },
    tunnel: {
      type: "boolean",
      description: "serve through a public cloudflared quick tunnel (phone on any network)",
    },
  },
  async run({ args }) {
    const dir = args.dir ? String(args.dir) : process.cwd();
    const port = args.port ? Number(args.port) : 0;
    if (!Number.isInteger(port) || port < 0) {
      throw new Error(`frogoe run: invalid port "${String(args.port)}"`);
    }
    const server = await startServer(dir, port);

    const lan = resolveLan();
    const lanUrl = server.urls.lan;
    const lanForBanner = args.tunnel === true ? undefined : lanUrl;
    const plan = planStartup(lan, probeFirewall(), args.tunnel === true);

    console.log(`\n  frogoe run — serving game`);
    console.log(`  local  ${server.urls.local}`);
    if (lanForBanner) {
      console.log(
        `  lan    ${lanForBanner}   (phone: same wifi — safe-area only exists on real devices)`,
      );
      printQr(lanForBanner);
    }
    for (const note of plan.notes) {
      console.log(`  ! ${note}`);
    }
    console.log(`  reload on file change — ctrl+c to stop\n`);

    let tunnel: TunnelHandle | undefined;
    let stopping = false;
    const bringUpTunnel = async (banner: string): Promise<void> => {
      if (tunnel || stopping) return;
      console.log(`\n  ${banner}`);
      try {
        tunnel = await startTunnel(server.port, {
          onProgress: (line) => console.log(`  ${line}`),
        });
        console.log(`  tunnel ${tunnel.url}   (phone: any network — reload ≤2s)`);
        printQr(tunnel.url);
        void tunnel.exited.then(() => {
          if (!stopping) console.log("\n  tunnel disconnected — lan/local still serving");
        });
      } catch (error) {
        tunnel = undefined;
        console.log(`  tunnel unavailable: ${message(error)}`);
        if (!lanUrl) {
          console.log(
            "  no lan address and no tunnel — the page is only reachable on this machine",
          );
        }
      }
    };

    if (plan.eagerTunnel) {
      await bringUpTunnel(
        args.tunnel === true
          ? "tunnel: starting… (first run may download cloudflared)"
          : "tunnel: starting as a fallback for this network…",
      );
    }

    const tunnelIntent = args.tunnel === true || plan.eagerTunnel;
    const nudge = setTimeout(() => {
      if (planNudge(server.sawRemote(), tunnel !== undefined || tunnelIntent) === "hint") {
        console.log(
          "\n  no phone has connected yet — if the lan QR fails on the phone, restart with: frogoe run --tunnel",
        );
      }
    }, NUDGE_MS);

    // the counterpoint to the nudge: a phone connecting AFTER the nudge
    // prints its own line, so the terminal never tells a stale story
    const connectWatch = setInterval(() => {
      if (!server.sawRemote()) return;
      clearInterval(connectWatch);
      const who = server.remote();
      console.log(`\n  phone connected${who ? ` — ${who}` : ""} (live reload active)`);
    }, 1000);

    const shutdown = (): void => {
      if (stopping) return;
      stopping = true;
      clearTimeout(nudge);
      clearInterval(connectWatch);
      tunnel?.stop();
      server.stop();
      process.exit(0);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);

    await new Promise(() => {});
  },
  meta: { description: "serve with live reload + phone QR" },
});
