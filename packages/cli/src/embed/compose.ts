/** Payload composer — game artifact + relay → one opaque base64 blob
 *  the card decodes into the sandboxed iframe's srcdoc. The bundle
 *  stays a pure game artifact (embed owns the host glue), and base64
 *  keeps the payload inert inside its <script type="application/
 *  octet-stream"> carrier: no markup parsing, no escaping hazards. */
import { RELAY_SCRIPT } from "./relay.ts";

export const injectRelay = (gameHtml: string, relayScript: string): string => {
  const at = gameHtml.lastIndexOf("</body>");
  if (at === -1) {
    return `${gameHtml}${relayScript}`;
  }
  return `${gameHtml.slice(0, at)}${relayScript}${gameHtml.slice(at)}`;
};

export const composePayload = (gameHtml: string): { payloadB64: string; srcdoc: string } => {
  const srcdoc = injectRelay(gameHtml, RELAY_SCRIPT);
  return { payloadB64: Buffer.from(srcdoc, "utf-8").toString("base64"), srcdoc };
};
