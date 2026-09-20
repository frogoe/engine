/** The play command executor — ONE implementation of the input protocol
 *  shared by `frogoe play` (stdio sessions) and the play-gate
 *  (game.play.js brains). Commands are the contract's semantic verbs;
 *  execution semantics (step-mode pause/resume, settle) live here so the
 *  CLI loop and the gate can never drift apart. */
import type { Page } from "puppeteer-core";

import type { LiveDriver } from "./live/driver.ts";

export interface CommandContext {
  driver: LiveDriver;
  page: Page;
  /** step mode: the world is paused between actions */
  paused: boolean;
  /** frames advanced per action in step mode */
  settle: number;
  /** game-time accumulator (seconds), advanced by holds and settles */
  elapsed: () => number;
  addElapsed: (seconds: number) => void;
}

export type PlayCommand = Record<string, unknown>;

/** Execute one command. Returns an error STRING (never throws) so both
 *  callers can report without crashing their loops. */
export const executeCommand = async (
  cmd: PlayCommand,
  ctx: CommandContext,
): Promise<string | null> => {
  const { driver, page, paused, settle } = ctx;
  const stepFrames = async (): Promise<void> => {
    if (!paused) return;
    await page.evaluate("window.__frogoe?.resume?.()");
    await new Promise((resolve) => {
      setTimeout(resolve, (settle * 1000) / 60);
    });
    await page.evaluate("window.__frogoe?.pause?.()");
    ctx.addElapsed(settle / 60);
  };
  try {
    if (cmd.quit === true) return "__quit__";
    if (typeof cmd.step === "number" || Array.isArray(cmd.step)) {
      const n = Math.max(
        1,
        Math.min(600, Number(Array.isArray(cmd.step) ? cmd.step[0] : cmd.step) || 1),
      );
      if (paused) {
        await page.evaluate("window.__frogoe?.resume?.()");
        await new Promise((resolve) => {
          setTimeout(resolve, (n * 1000) / 60);
        });
        await page.evaluate("window.__frogoe?.pause?.()");
        ctx.addElapsed(n / 60);
      } else {
        await new Promise((resolve) => {
          setTimeout(resolve, (n * 1000) / 60);
        });
        ctx.addElapsed(n / 60);
      }
      return null;
    }
    if (Array.isArray(cmd.tap)) {
      await stepFrames();
      await driver.tap(Number(cmd.tap[0]), Number(cmd.tap[1]));
      return null;
    }
    if (typeof cmd.click === "string") {
      // selector click — buttons by NAME, never by guessed pixels
      await stepFrames();
      try {
        await page.click(cmd.click);
      } catch {
        return `click: no match for ${cmd.click}`;
      }
      return null;
    }
    if (typeof cmd.press === "string") {
      await stepFrames();
      await driver.press(cmd.press);
      return null;
    }
    if (Array.isArray(cmd.hold)) {
      // {"hold":["ArrowLeft",30]} — key down, N frames, key up
      const [code, frames] = [String(cmd.hold[0] ?? ""), Number(cmd.hold[1] ?? 20)];
      if (paused) await page.evaluate("window.__frogoe?.resume?.()");
      await driver.holdKey(code, frames);
      ctx.addElapsed(frames / 60);
      if (paused) await page.evaluate("window.__frogoe?.pause?.()");
      return null;
    }
    if (typeof cmd.type === "string") {
      await stepFrames();
      await driver.type(cmd.type);
      return null;
    }
    if (Array.isArray(cmd.drag) && cmd.drag.length === 4) {
      await stepFrames();
      await driver.drag(
        Number(cmd.drag[0]),
        Number(cmd.drag[1]),
        Number(cmd.drag[2]),
        Number(cmd.drag[3]),
      );
      return null;
    }
    if (Array.isArray(cmd.resize) && cmd.resize.length === 2) {
      await page.setViewport({
        height: Number(cmd.resize[1]),
        width: Number(cmd.resize[0]),
      });
      return null;
    }
    return "unknown command — tap|click|press|hold|type|drag|step|resize|quit";
  } catch (error) {
    return String(error).slice(0, 160);
  }
};
