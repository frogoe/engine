/** The driver seam. Phases orchestrate against LiveDriver only — tests
 *  substitute FakeDriver, production runs puppeteer-core against a
 *  chrome-headless-shell page. Every method is semantic (no raw script
 *  strings leak past this boundary). */
import type { Page } from "puppeteer-core";

import type { CollapseMeasure, FinishEvent, OutlineMeasure } from "./types.ts";
import {
  CANVAS_HASH_SCRIPT,
  CANVAS_PAINTED_SCRIPT,
  DOM_PROBE_SCRIPT,
  FINISH_EVENTS_SCRIPT,
  FPS_MARK_SCRIPT,
  GAME_STATE_SCRIPT,
  HUD_MEASURE_SCRIPT,
  PROBE_SCRIPT,
  RETRY_PRESENCE_SCRIPT,
  fpsSinceScript,
} from "./sampler.ts";

export interface DomProbe {
  canvasPresent: boolean;
  hudPresent: boolean;
  state: string;
}

export interface RetryPresence {
  gameover: boolean;
  retry: boolean;
}

export interface LiveDriver {
  /** Uncaught page exceptions, accumulated across navigations. */
  errors(): string[];
  /** console.error output, accumulated across navigations. */
  consoleErrors(): string[];
  domProbe(): Promise<DomProbe>;
  canvasPainted(): Promise<boolean>;
  canvasHash(): Promise<number | null>;
  gameState(): Promise<string>;
  finishEvents(): Promise<FinishEvent[]>;
  fpsMark(): Promise<number>;
  fpsSince(mark: number): Promise<number[]>;
  hudMeasures(): Promise<Array<OutlineMeasure & CollapseMeasure>>;
  retryPresence(): Promise<RetryPresence>;
  tap(x: number, y: number): Promise<void>;
  hold(x: number, y: number, ms: number): Promise<void>;
  /** Press at (x1,y1), sweep to (x2,y2), release — the drag/steer
   *  verb: games that only respond to movement-while-pressed. */
  drag(x1: number, y1: number, x2: number, y2: number): Promise<void>;
  /** Clicks [data-block-retry] and resolves true only if a navigation
   *  (reload) follows within timeoutMs. Returns false when the button
   *  is absent or the click produces no reload. */
  clickRetryAwaitReload(timeoutMs: number): Promise<boolean>;
  screenshot(): Promise<Uint8Array>;
  viewport(): { height: number; width: number };
}

// ── puppeteer implementation ────────────────────────────────────────────────

export interface PuppeteerDriverOptions {
  page: Page;
  size: { height: number; width: number };
}

export const createPuppeteerDriver = ({ page, size }: PuppeteerDriverOptions): LiveDriver => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (error: unknown) => {
    pageErrors.push(String(error));
  });
  page.on("console", (message: { type(): string; text(): string }) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.evaluateOnNewDocument(PROBE_SCRIPT);

  // one cast site for the string-evaluate seam (scripts return plain data)
  const read = async <T>(script: string): Promise<T> => (await page.evaluate(script)) as T;

  return {
    errors: () => pageErrors,
    consoleErrors: () => consoleErrors,
    async domProbe() {
      return await read<DomProbe>(DOM_PROBE_SCRIPT);
    },
    async canvasPainted() {
      return await read<boolean>(CANVAS_PAINTED_SCRIPT);
    },
    async canvasHash() {
      return await read<number | null>(CANVAS_HASH_SCRIPT);
    },
    async gameState() {
      return await read<string>(GAME_STATE_SCRIPT);
    },
    async finishEvents() {
      return await read<FinishEvent[]>(FINISH_EVENTS_SCRIPT);
    },
    async fpsMark() {
      return await read<number>(FPS_MARK_SCRIPT);
    },
    async fpsSince(mark: number) {
      return await read<number[]>(fpsSinceScript(mark));
    },
    async hudMeasures() {
      return await read<Array<OutlineMeasure & CollapseMeasure>>(HUD_MEASURE_SCRIPT);
    },
    async retryPresence() {
      return await read<RetryPresence>(RETRY_PRESENCE_SCRIPT);
    },
    async tap(x: number, y: number) {
      await page.mouse.click(x, y);
    },
    async hold(x: number, y: number, ms: number) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await new Promise((resolve) => {
        setTimeout(resolve, ms);
      });
      await page.mouse.up();
    },
    async drag(x1: number, y1: number, x2: number, y2: number) {
      await page.mouse.move(x1, y1);
      await page.mouse.down();
      await page.mouse.move(x2, y2, { steps: 6 });
      await new Promise((resolve) => {
        setTimeout(resolve, 80);
      });
      await page.mouse.up();
    },
    async clickRetryAwaitReload(timeoutMs: number) {
      // the card animates in AFTER state flips "over" — clicking a
      // closed overlay hits pointer-events:none and proves nothing.
      // Wait until the button is genuinely interactable first.
      const interactable = `(() => {
        const b = document.querySelector("[data-block-retry]");
        if (!b) return false;
        const s = getComputedStyle(b);
        if (s.pointerEvents === "none" || s.visibility === "hidden" || s.display === "none") {
          return false;
        }
        const r = b.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return false;
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return Boolean(hit && (hit === b || b.contains(hit)));
      })()`;
      const grace = 3_000;
      const started = Date.now();
      for (;;) {
        if ((await page.evaluate(interactable)) === true) {
          break;
        }
        if (Date.now() - started > grace) {
          return false;
        }
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
      }
      // register the navigation wait BEFORE the click so the reload
      // cannot slip past it; the catch keeps an absent reload from
      // becoming an unhandled rejection
      const navigated = page
        .waitForNavigation({ timeout: timeoutMs, waitUntil: "domcontentloaded" })
        .then(() => true)
        .catch(() => false);
      const button = await page.$("[data-block-retry]");
      if (!button) {
        return false;
      }
      await button.click();
      return await navigated;
    },
    async screenshot() {
      return await page.screenshot({ encoding: "binary" });
    },
    viewport: () => size,
  };
};
