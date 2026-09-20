import { describe, expect, test } from "bun:test";
/** The executor harness — executeCommand against scripted fakes, no
 *  browser. This is the seam where session semantics live (step-mode
 *  pause/resume ordering, selector clicks, holds); it is the wall that
 *  keeps orchestration bugs out of live sessions. The FakePage records
 *  every evaluate in order — ordering IS the assertion. */
import { executeCommand, type CommandContext } from "../src/play-commands.ts";

class FakePage {
  evals: string[] = [];
  clicks: string[] = [];
  viewports: Array<{ h: number; w: number }> = [];
  clickError = false;

  async evaluate(script: string): Promise<unknown> {
    this.evals.push(script);
    return null;
  }

  async click(sel: string): Promise<void> {
    this.clicks.push(sel);
    if (this.clickError) throw new Error("not found");
  }

  async setViewport(v: { height: number; width: number }): Promise<void> {
    this.viewports.push({ h: v.height, w: v.width });
  }
}

class FakeDriver {
  taps: Array<[number, number]> = [];
  presses: string[] = [];
  holds: Array<{ code: string; frames: number }> = [];
  types: string[] = [];
  drags: number[] = [];

  async tap(x: number, y: number): Promise<void> {
    this.taps.push([x, y]);
  }

  async press(code: string): Promise<void> {
    this.presses.push(code);
  }

  async holdKey(code: string, frames: number): Promise<void> {
    this.holds.push({ code, frames });
  }

  async type(text: string): Promise<void> {
    this.types.push(text);
  }

  async drag(x1: number, y1: number, x2: number, y2: number): Promise<void> {
    this.drags.push(x1, y1, x2, y2);
  }
}

const ctx = (
  page: FakePage,
  driver: FakeDriver,
  paused: boolean,
): CommandContext & { elapsedNow: { v: number } } => {
  const elapsedNow = { v: 0 };
  return {
    addElapsed: (s) => {
      elapsedNow.v += s;
    },
    driver: driver as never,
    elapsed: () => elapsedNow.v,
    elapsedNow,
    page: page as never,
    paused,
    settle: 10,
  };
};

describe("executor (step mode)", () => {
  test("tap: resume → drive → pause, in that exact order", async () => {
    const page = new FakePage();
    const driver = new FakeDriver();
    const c = ctx(page, driver, true);
    await executeCommand({ tap: [195, 400] }, c);
    expect(page.evals[0]).toContain("resume");
    expect(page.evals[1]).toContain("pause");
    expect(driver.taps).toEqual([[195, 400]]);
  });

  test("hold: resume → holdKey → pause, elapsed grows by frames/60", async () => {
    const page = new FakePage();
    const driver = new FakeDriver();
    const c = ctx(page, driver, true);
    await executeCommand({ hold: ["ArrowLeft", 30] }, c);
    expect(page.evals[0]).toContain("resume");
    expect(page.evals[page.evals.length - 1]).toContain("pause");
    expect(driver.holds).toEqual([{ code: "ArrowLeft", frames: 30 }]);
    expect(c.elapsedNow.v).toBeCloseTo(0.5, 5);
  });

  test("click: settles first, selector resolved; failures return an error string, never throw", async () => {
    const page = new FakePage();
    const driver = new FakeDriver();
    const ok = await executeCommand({ click: "[data-block-play]" }, ctx(page, driver, true));
    expect(ok).toBeNull();
    expect(page.clicks).toEqual(["[data-block-play]"]);
    page.clickError = true;
    const err = await executeCommand({ click: ".gone" }, ctx(page, driver, true));
    expect(err).toContain("no match");
  });

  test("step N: resume → pause with N/60 elapsed (realtime skips both)", async () => {
    const page = new FakePage();
    const c = ctx(page, new FakeDriver(), true);
    await executeCommand({ step: 30 }, c);
    expect(page.evals).toHaveLength(2); // resume + pause, nothing between
    expect(c.elapsedNow.v).toBeCloseTo(0.5, 5);
    const rtPage = new FakePage();
    const rt = ctx(rtPage, new FakeDriver(), false);
    await executeCommand({ step: 30 }, rt);
    expect(rtPage.evals).toEqual([]); // realtime: no pause dance
  });

  test("unknown and quit semantics", async () => {
    const page = new FakePage();
    const err = await executeCommand({ poke: 1 }, ctx(page, new FakeDriver(), true));
    expect(err).toContain("unknown command");
    const quit = await executeCommand({ quit: true }, ctx(page, new FakeDriver(), true));
    expect(quit).toBe("__quit__");
  });

  test("resize hits the viewport, no pause churn", async () => {
    const page = new FakePage();
    await executeCommand({ resize: [960, 640] }, ctx(page, new FakeDriver(), true));
    expect(page.viewports).toEqual([{ h: 640, w: 960 }]);
    expect(page.evals).toEqual([]);
  });
});
