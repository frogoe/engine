/** frogoe run — serve the game folder with live reload + phone QR.
 *  Hono app on Bun.serve; a tiny EventSource script is injected into HTML
 *  responses; fs.watch broadcasts reloads. */
import { existsSync, readFileSync, statSync, watch } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createAdaptorServer } from "@hono/node-server";
import { Hono } from "hono";

const RELOAD_SCRIPT =
  '<script>(function(){var es=new EventSource("/__frogoe/reload");es.onmessage=function(){location.reload()};})();</script>';

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
  stop: () => void;
  urls: { lan?: string; local: string };
}

const lanIp = (): string | undefined => {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return undefined;
};

export const startServer = async (dir: string, requestedPort = 0): Promise<DevServer> => {
  const root = path.resolve(dir);
  if (!existsSync(path.join(root, "index.html"))) {
    throw new Error(`frogoe run: no index.html in ${root} — is this a game folder?`);
  }

  const clients = new Set<ReadableStreamDefaultController<Uint8Array>>();

  const app = new Hono();
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
        ? html.replace(/<\/body>/iu, `${RELOAD_SCRIPT}</body>`)
        : html + RELOAD_SCRIPT;
      return c.body(injected, 200, { "content-type": type });
    }
    return c.body(body, 200, { "content-type": type });
  });

  const server = createAdaptorServer({ fetch: app.fetch });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(requestedPort, () => resolve());
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
  const ip = lanIp();
  const lan = ip ? `http://${ip}:${port}` : undefined;

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
    stop() {
      clearTimeout(timer);
      watcher.close();
      (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
      server.close();
    },
    urls: { lan, local },
  };
};

export const printBanner = (urls: { lan?: string; local: string }): void => {
  console.log(`\n  frogoe run — serving game`);
  console.log(`  local  ${urls.local}`);
  if (urls.lan) {
    console.log(`  lan    ${urls.lan}   (phone: safe-area only exists on real devices)`);
    import("qrcode-terminal")
      .then((mod) => {
        // CJS interop: named exports are not statically detected under node
        const qrcode = (mod as unknown as { default?: typeof mod }).default ?? mod;
        qrcode.generate(urls.lan ?? "", { small: true }, (qr: string) => {
          console.log(qr);
        });
      })
      .catch(() => {
        console.log("  (qr unavailable — open the lan url directly)");
      });
  }
  console.log("  reload on file change — ctrl+c to stop\n");
};
