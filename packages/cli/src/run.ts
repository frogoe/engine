/** frogoe run — serve the game folder with live reload + phone QR.
 *  Hono app on a node server; a tiny script is injected into HTML
 *  responses. Reload is transport-adaptive: EventSource for instant
 *  pushes, plus a /__frogoe/version poll every 2s as the universal
 *  fallback — quick tunnels and buffering proxies cannot kill reload. */
import { existsSync, readFileSync, statSync, watch } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createAdaptorServer } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";

import { isLoopback, resolveLan, selfAddresses } from "./net/ip.ts";

/** v is baked per response — a poll that sees a different v reloads. */
const buildReloadScript = (version: number): string =>
  `<script>(function(){var v="${String(version)}";` +
  'try{var es=new EventSource("/__frogoe/reload");es.onmessage=function(){location.reload()};es.onerror=function(){es.close()};}catch(e){}' +
  'setInterval(function(){fetch("/__frogoe/version",{cache:"no-store"}).then(function(r){return r.text()}).then(function(t){if(t!==v)location.reload()}).catch(function(){})},2000);' +
  "})();</script>";

const MIME: Record<string, string> = {
  css: "text/css; charset=utf-8",
  htm: "text/html; charset=utf-8",
  html: "text/html; charset=utf-8",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  webp: "image/webp",
  woff2: "font/woff2",
};

export interface DevServer {
  port: number;
  /** last non-loopback client address (the phone), once one has connected */
  remote: () => string | undefined;
  /** true once any non-loopback client reached the server (a phone) */
  sawRemote: () => boolean;
  stop: () => void;
  urls: { lan?: string; local: string };
}

export const startServer = async (dir: string, requestedPort = 0): Promise<DevServer> => {
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, "index.html"))) {
    throw new Error(`frogoe run: no index.html in ${root} — is this a game folder?`);
  }

  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();
  let version = 0;
  let remoteSeen = false;
  let lastRemote = "";
  // snapshot at start: a self-curl over the lan ip must not read as a phone
  const own = selfAddresses(os.networkInterfaces());

  const app = new Hono();
  // phone-connect tracking: any request from beyond this machine counts
  app.use("*", async (c, next) => {
    try {
      const address = getConnInfo(c).remote.address;
      if (address && !isLoopback(address) && !own.has(address)) {
        remoteSeen = true;
        lastRemote = address;
      }
    } catch {
      // non-socket context — tracking is best effort
    }
    await next();
  });
  app.get("/__frogoe/reload", (c) => {
    const stream = new ReadableStream<Uint8Array>({
      cancel() {
        // controller removal happens in start()'s catch
      },
      start(controller) {
        clients.add(controller);
        controller.enqueue(new TextEncoder().encode("retry: 3000\n\n"));
      },
    });
    return c.body(stream, {
      headers: {
        "cache-control": "no-store",
        connection: "keep-alive",
        "content-type": "text/event-stream",
      },
    });
  });
  app.get("/__frogoe/version", (c) =>
    c.text(String(version), 200, { "cache-control": "no-store" }),
  );
  app.get("*", (c) => {
    const raw = decodeURIComponent(new URL(c.req.url).pathname);
    const safe = path.normalize(raw).replaceAll("\\", "/");
    let file = path.join(root, safe === "/" ? "index.html" : safe);
    if (!file.startsWith(root)) {
      return c.text("forbidden", 403);
    }
    if (existsSync(file) && statSync(file).isDirectory()) {
      file = path.join(file, "index.html");
    }
    if (!existsSync(file)) {
      return c.text(`frogoe run: not found: ${raw}`, 404);
    }
    const body = readFileSync(file);
    const ext = path.extname(file).slice(1).toLowerCase();
    const type = MIME[ext] ?? "application/octet-stream";
    if (ext === "html" || ext === "htm") {
      const html = body.toString("utf-8");
      const injected = /<\/body>/iu.test(html)
        ? html.replace(/<\/body>/iu, `${buildReloadScript(version)}</body>`)
        : html + buildReloadScript(version);
      return c.body(injected, 200, {
        "cache-control": "no-store",
        "content-type": type,
      });
    }
    return c.body(body, 200, { "content-type": type });
  });

  // explicit 0.0.0.0: the phone path is ipv4 lan — a bare :: bind leaves
  // lsof showing ipv6-only and muddies the firewall prompt
  const server = createAdaptorServer({ fetch: app.fetch });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, "0.0.0.0", () => resolve());
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  if (!port) {
    // node 18.2+: destroy keep-alive (SSE) sockets so stop() truly stops
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    server.close();
    throw new Error("frogoe run: server failed to bind a port");
  }
  const local = `http://localhost:${port}`;
  const lanInfo = resolveLan();
  const lan = lanInfo.ip ? `http://${lanInfo.ip}:${port}` : undefined;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const watcher = watch(root, { recursive: true }, (_event, file) => {
    // tool-owned output is not game source: the live sandbox writes
    // screenshots into snapshots/, and a screenshot must never reload
    // the dev page (it races real, button-driven reloads)
    const first = file?.split(path.sep)[0];
    if (first === "snapshots" || first === ".frogoe") {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      version += 1;
      const payload = new TextEncoder().encode("data: reload\n\n");
      for (const client of clients) {
        try {
          client.enqueue(payload);
        } catch {
          clients.delete(client);
        }
      }
    }, 100);
  });

  return {
    port,
    sawRemote: () => remoteSeen,
    remote: () => (remoteSeen ? lastRemote : undefined),
    stop() {
      clearTimeout(timer);
      watcher.close();
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      server.close();
    },
    urls: { lan, local },
  };
};
