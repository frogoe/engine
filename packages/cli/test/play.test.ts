import { afterAll, describe, expect, test } from "bun:test";
/** frogoe play — the agent loop e2e: a real game booted in a real browser,
 *  JSONL frames out, contract input in, clean exit, recorded evidence.
 *  Timing-tolerant (a real Chrome), structure-strict (the protocol the
 *  agent codes against). */
import { cpSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

const tmp = path.join(import.meta.dir, "../.tmp-play");
const gameDir = path.join(tmp, "flappy");

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const bootGame = (): void => {
  rmSync(tmp, { recursive: true, force: true });
  cpSync(path.join(import.meta.dir, "../../../examples/flappy"), gameDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(path.join(import.meta.dir, "../../../examples/flappy"), src);
      return !/^(dist|snapshots|node_modules|export)/u.test(rel);
    },
  });
};

interface Line {
  error?: string;
  frame?: string;
  legend?: string;
  state?: string;
  version?: string;
}

const session = async (inputs: string[], extra: string[] = []) => {
  const proc = Bun.spawn(
    ["bun", path.join(import.meta.dir, "../src/cli.ts"), "play", gameDir, ...extra],
    {
      env: { ...process.env, NO_COLOR: "1" },
      stderr: "pipe",
      stdin: "pipe",
      stdout: "pipe",
    },
  );
  const writer = proc.stdin;
  const out: Line[] = [];
  const reader = Bun.readableStreamToText(proc.stdout).then((text) => {
    for (const ln of text.split("\n")) {
      if (ln.trim().length === 0) continue;
      try {
        out.push(JSON.parse(ln) as Line);
      } catch {
        /* non-JSON noise (server banners) is tolerated on stdout */
      }
    }
  });
  const send = (text: string) => {
    writer.write(new TextEncoder().encode(`${text}\n`));
  };
  for (const input of inputs) {
    send(input);
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
  }
  send('{"quit":true}');
  writer.end();
  const exit = await proc.exited;
  await reader;
  return { exit, lines: out };
};

describe("frogoe play (agent eyes + hands)", () => {
  test("legend first, frames flow, input lands, exit clean, evidence recorded", async () => {
    bootGame();
    const { exit, lines } = await session(
      ['{"step":30}', '{"tap":[195,400]}', '{"press":"Space"}'],
      ["--record", "session"],
    );
    expect(exit).toBe(0);
    const legend = lines.find((l) => l.legend !== undefined);
    expect(legend?.legend).toContain("ramp @%&*8=+~;:,-^`'");
    expect(legend?.version).toBe("0.2.0");
    const frames = lines.filter((l) => l.frame !== undefined);
    expect(frames.length).toBeGreaterThanOrEqual(3); // boot + step + tap + press
    for (const f of frames) {
      expect(f.frame?.split("\n").length).toBeGreaterThan(20);
      expect(f.state).toBeDefined();
    }
    const errors = lines.filter((l) => l.error !== undefined);
    expect(errors).toEqual([]);
    const log = readFileSync(path.join(gameDir, "snapshots", "session.jsonl"), "utf-8");
    expect(log.split("\n").filter((l) => l.trim().length > 0).length).toBeGreaterThanOrEqual(3);
    for (const ln of log.split("\n")) {
      if (ln.trim().length === 0) continue;
      expect(JSON.parse(ln)!.reason).toBeDefined(); // evidence rows carry why
    }
  }, 90_000);

  test("unknown commands are errors, never crashes; bad JSON is tolerated", async () => {
    bootGame();
    const { exit, lines } = await session(["not json at all", '{"poke":1}']);
    expect(exit).toBe(0);
    expect(lines.some((l) => l.error?.startsWith("not JSON"))).toBeTrue();
    expect(lines.some((l) => l.error?.includes("unknown command"))).toBeTrue();
  }, 90_000);
});
