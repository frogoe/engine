/** frogoe lint — static contract checks. Pure functions, zero browser deps. */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { parseBrief, SESSIONS, VERBS, type Brief } from "./brief.ts";
import { contrastRatio, isHex } from "./contrast.ts";
import { checkArt } from "./art.ts";

export type Severity = "error" | "warning";

export interface Finding {
  code: string;
  file: string;
  fix: string;
  line?: number;
  message: string;
  recipe?: string;
  severity: Severity;
}

export interface CheckResult {
  errors: number;
  findings: Finding[];
  warnings: number;
}

/** Which input wiring each core verb REQUIRES in game.js. The floor is
 *  input.on("down") for every touchable game; drag/up layer on top for
 *  verbs whose core gesture needs them. `type` requires down + key: the
 *  keyboard flows through the contract (blur-safe, repeat-suppressed)
 *  and touch devices get keys from the registry's hud-keyboard block. */
const HANDLER_PATTERNS = {
  down: /input\.on\(\s*["']down["']/u,
  drag: /input\.on\(\s*["']drag["']/u,
  key: /input\.on\(\s*["']key["']/u,
  up: /input\.on\(\s*["']up["']/u,
} as const;

const VERB_REQUIREMENTS: Record<string, Array<{ label: string; pattern: RegExp }>> = {
  aim: [
    { label: 'input.on("down"', pattern: HANDLER_PATTERNS.down },
    { label: 'input.on("drag"', pattern: HANDLER_PATTERNS.drag },
  ],
  draw: [
    { label: 'input.on("down"', pattern: HANDLER_PATTERNS.down },
    { label: 'input.on("drag"', pattern: HANDLER_PATTERNS.drag },
    { label: 'input.on("up"', pattern: HANDLER_PATTERNS.up },
  ],
  hold: [
    { label: 'input.on("down"', pattern: HANDLER_PATTERNS.down },
    { label: 'input.on("up"', pattern: HANDLER_PATTERNS.up },
  ],
  idle: [{ label: 'input.on("down"', pattern: HANDLER_PATTERNS.down }],
  place: [{ label: 'input.on("down"', pattern: HANDLER_PATTERNS.down }],
  steer: [
    { label: 'input.on("down"', pattern: HANDLER_PATTERNS.down },
    { label: 'input.on("drag"', pattern: HANDLER_PATTERNS.drag },
  ],
  swap: [{ label: 'input.on("down"', pattern: HANDLER_PATTERNS.down }],
  tap: [{ label: 'input.on("down"', pattern: HANDLER_PATTERNS.down }],
  type: [
    { label: 'input.on("down"', pattern: HANDLER_PATTERNS.down },
    { label: 'input.on("key"', pattern: HANDLER_PATTERNS.key },
  ],
};

const read = (file: string): string => {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return "";
  }
};

const linesOf = (source: string): string[] => source.split("\n");

const findLine = (source: string, pattern: RegExp): number | undefined => {
  const idx = linesOf(source).findIndex((line) => pattern.test(line));
  return idx === -1 ? undefined : idx + 1;
};

const checkBrief = (dir: string, findings: Finding[]): Brief | null => {
  const file = path.join(dir, "BRIEF.md");
  if (!existsSync(file)) {
    findings.push({
      code: "brief/missing",
      file: "BRIEF.md",
      fix: "frogoe init writes a stub BRIEF.md — or copy the schema from frogoe-core → brief-format",
      message: "feed games declare intent before code",
      severity: "error",
    });
    return null;
  }
  const source = read(file);
  const todoLine = findLine(source, /TODO/u);
  if (todoLine !== undefined) {
    findings.push({
      code: "brief/todo",
      file: "BRIEF.md",
      fix: "fill every TODO — the brief is the gate's measuring stick",
      line: todoLine,
      message: "BRIEF.md still has TODO markers",
      severity: "error",
    });
  }
  const brief = parseBrief(source);
  if (!brief) {
    findings.push({
      code: "brief/frontmatter",
      file: "BRIEF.md",
      fix: "start the file with a --- frontmatter block (frogoe-core → brief-format)",
      message: "no frontmatter block found",
      severity: "error",
    });
    return null;
  }
  if (brief.verb !== undefined && !VERBS.includes(brief.verb as never)) {
    findings.push({
      code: "brief/verb",
      file: "BRIEF.md",
      fix: `verb "${brief.verb}" is not in the enum (${VERBS.join("|")}) — pick the ONE word that names the core action (frogoe-core → brief-format)`,
      message: "unknown core verb",
      severity: "error",
    });
  }
  if (brief.session !== undefined && !SESSIONS.includes(brief.session as never)) {
    findings.push({
      code: "brief/session",
      file: "BRIEF.md",
      fix: `session "${brief.session}" is not in the enum (${SESSIONS.join("|")}) — blitz is the short arcade loop (default), round is turn-based, toy never ends (frogoe-core → brief-format)`,
      message: "unknown session shape",
      severity: "error",
    });
  }
  const problems: string[] = [];
  if (!brief.title || brief.title.length < 2 || brief.title.length > 40) {
    problems.push("title (2–40 chars)");
  }
  if (!brief.verb || !VERBS.includes(brief.verb as never)) {
    problems.push(`verb (${VERBS.join("|")})`);
  }
  if (!brief.mood) {
    problems.push("mood (one phrase)");
  }
  for (const key of ["bg", "fg", "accent"] as const) {
    if (!brief[key] || !isHex(brief[key] ?? "")) {
      problems.push(`palette.${key} (hex)`);
    }
  }
  if (problems.length > 0) {
    findings.push({
      code: "brief/frontmatter",
      file: "BRIEF.md",
      fix: `missing/invalid: ${problems.join(", ")} — frogoe-core → brief-format`,
      message: "frontmatter is incomplete",
      severity: "error",
    });
  }
  const outline = typeof brief.outline === "string" ? brief.outline : (brief.bg ?? "");
  if (brief.fg && isHex(brief.fg) && isHex(outline) && outline !== brief.bg) {
    // game-native: fg vs outline (the readability partner, not the sky)
    const ratio = contrastRatio(brief.fg, outline);
    if (ratio < 3) {
      findings.push({
        code: "brief/contrast",
        file: "BRIEF.md",
        fix: `fg/outline contrast is ${ratio.toFixed(2)}:1 — HUD floor is 3:1; the outline is the readability partner in games (not bg); brighten fg or darken outline`,
        message: "declared palette fails the HUD readability floor",
        severity: "error",
      });
    }
  } else if (brief.bg && brief.fg && isHex(brief.bg) && isHex(brief.fg)) {
    // no outline declared — fall back to fg vs bg (the non-game default)
    const ratio = contrastRatio(brief.fg, brief.bg);
    if (ratio < 3) {
      findings.push({
        code: "brief/contrast",
        file: "BRIEF.md",
        fix: `declared fg/bg contrast is ${ratio.toFixed(2)}:1 — HUD floor is 3:1; games should declare palette.outline (the readability partner) in BRIEF.md`,
        message: "declared palette fails the HUD readability floor",
        severity: "error",
      });
    }
  }
  return brief;
};

const checkFolder = (dir: string, findings: Finding[], brief: Brief | null): void => {
  const index = read(path.join(dir, "index.html"));
  if (!index) {
    findings.push({
      code: "folder/index-missing",
      file: "index.html",
      fix: "the entry shell: canvas + import map + hud layer (frogoe init writes one)",
      message: "no index.html",
      severity: "error",
    });
    return;
  }
  if (!/<canvas[^>]+id="c"/iu.test(index)) {
    findings.push({
      code: "folder/canvas",
      file: "index.html",
      fix: 'add <canvas id="c"></canvas> — the contract boots on that exact element',
      message: 'missing <canvas id="c">',
      severity: "error",
    });
  }
  if (!/viewport-fit=cover/u.test(index)) {
    findings.push({
      code: "folder/viewport-fit",
      file: "index.html",
      fix: "viewport meta must include viewport-fit=cover or safe-area insets read as zero",
      message: "viewport-fit=cover missing",
      severity: "error",
    });
  }
  if (!/(?:-webkit-)?user-select:\s*none/u.test(index)) {
    findings.push({
      code: "folder/touch-select",
      file: "index.html",
      fix: "phones are the primary device — add `-webkit-user-select: none; user-select: none; -webkit-touch-callout: none;` on html/body or a long-press summons the text-selection UI mid-game on iOS and Android alike (frogoe-core → references/audio.md)",
      message: "long-press can summon the phone selection UI",
      severity: "error",
    });
  }
  const mapMatch = /<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/u.exec(index);
  const mapping = mapMatch?.[1];
  if (!mapping) {
    findings.push({
      code: "folder/importmap",
      file: "index.html",
      fix: 'add <script type="importmap"> with {"imports":{"frogoe":"./.frogoe/contract.js"}}',
      message: "no import map",
      severity: "error",
    });
  } else {
    try {
      const parsed = JSON.parse(mapping) as { imports?: Record<string, string> };
      if (parsed.imports?.frogoe !== "./.frogoe/contract.js") {
        findings.push({
          code: "folder/importmap",
          file: "index.html",
          fix: 'imports.frogoe must be exactly "./.frogoe/contract.js" — the pinned contract',
          message: `frogoe maps to ${parsed.imports?.frogoe ?? "(absent)"}`,
          severity: "error",
        });
      }
    } catch {
      findings.push({
        code: "folder/importmap",
        file: "index.html",
        fix: "import map is not valid JSON",
        message: "import map fails to parse",
        severity: "error",
      });
    }
  }

  const game = read(path.join(dir, "game.js"));
  if (!game) {
    findings.push({
      code: "folder/game-missing",
      file: "game.js",
      fix: "the whole simulation: defineGame(({stage,input,loop,finish}) => {...})",
      message: "no game.js",
      severity: "error",
    });
    return;
  }
  if (!/loop\.update\s*=/u.test(game)) {
    findings.push({
      code: "game/loop-update",
      file: "game.js",
      fix: "fill loop.update = (dt) => {...} inside the closure",
      message: "loop.update is never assigned",
      severity: "warning",
    });
  }
  if (!/loop\.render\s*=/u.test(game)) {
    findings.push({
      code: "game/loop-render",
      file: "game.js",
      fix: "fill loop.render = (ctx) => {...} inside the closure",
      message: "loop.render is never assigned",
      severity: "warning",
    });
  }

  // verb ↔ wiring: the declared core verb names the handlers the game
  // must actually wire — a `draw` toy without drag handlers is a game
  // that cannot be drawn in. The full table lives in frogoe-core →
  // brief-format. Skipped when the verb itself is invalid (brief/verb
  // already points there).
  const requirements = brief?.verb !== undefined ? VERB_REQUIREMENTS[brief.verb] : undefined;
  if (requirements !== undefined) {
    const missing = requirements.filter((req) => !req.pattern.test(game));
    if (missing.length > 0) {
      findings.push({
        code: "input/verb-mismatch",
        file: "game.js",
        fix: `verb "${String(brief?.verb)}" requires ${missing.map((m) => m.label).join(" + ")} — wire it inside defineGame (frogoe-core → brief-format, verb table)`,
        line: findLine(game, HANDLER_PATTERNS.down) ?? undefined,
        message: `declared verb "${String(brief?.verb)}" but its input wiring is missing`,
        recipe: "frogoe-core → brief-format (verb → handler table)",
        severity: "error",
      });
    }
  }

  // logic verbs carry real semantics (matching, resolution, turns) — the
  // blind sandbox proves they RUN, only game.test.js proves they are RIGHT.
  // Author-owned tests, checked into the folder beside game.js.
  if (
    (brief?.verb === "type" ||
      brief?.verb === "swap" ||
      brief?.verb === "place" ||
      brief?.session === "round") &&
    !existsSync(path.join(dir, "game.test.js"))
  ) {
    findings.push({
      code: "test/logic-untested",
      file: "game.test.js",
      fix: `${brief?.session !== undefined ? `session "${String(brief.session)}"` : `verb "${String(brief.verb)}"`} carries real logic — ship game.test.js: bootForTest from "frogoe", drive input, assert finishes()/draws (frogoe-core → testable seam)`,
      message: "logic verb with no game.test.js — semantics are unverified",
      recipe: "frogoe-core → testable seam",
      severity: "error",
    });
  }

  const gameLine = (pattern: RegExp): number | undefined => findLine(game, pattern);
  // raw keyboard listeners bypass the contract entirely: no blur safety
  // (alt-tab leaves held keys stuck), no repeat suppression, and the
  // sandbox's type ladder never verifies them
  const rawKeyLine = gameLine(/addEventListener\(\s*["']key(?:down|up|press)["']/u);
  if (rawKeyLine !== undefined) {
    findings.push({
      code: "input/raw-keyboard",
      file: "game.js",
      fix: 'listen through the contract: input.on("key", (k) => ...) for edges, poll input.keys for held state — blur-safe and sandbox-verified',
      line: rawKeyLine,
      message: "raw keydown/keyup listener bypasses the contract",
      recipe: "frogoe-core → contract (keyboard)",
      severity: "error",
    });
  }
  const dragLine = gameLine(/\+=\s*(?:p|pt|pointer)\.(?:dx|dy)\b/u);
  if (dragLine !== undefined) {
    findings.push({
      code: "input/incremental-drag",
      file: "game.js",
      fix: "pointer.dx is anchor-relative — assign absolutely (x = grabX + p.dx) or track your own lastX",
      line: dragLine,
      message: "re-adding anchor-relative dx per event rockets the actor into a wall",
      recipe: "frogoe-core → contract (drag semantics)",
      severity: "error",
    });
  }
  const absLine = gameLine(/[=]\s*(?:pointer|p|touch)\.x\b(?!.*(?:dx|anchor|base|last))/u);
  if (absLine !== undefined) {
    findings.push({
      code: "input/absolute-steering",
      file: "game.js",
      fix: "steer from relative deltas (p.dx) or your own anchor — absolute x thumb-ghosts",
      line: absLine,
      message: "steering appears to follow absolute pointer x",
      recipe: "frogoe-core → contract (drag semantics)",
      severity: "warning",
    });
  }
  const spawnLine = gameLine(/Math\.random\(\)\s*\*\s*(?:W\b|innerWidth|window\.innerWidth)/u);
  if (spawnLine !== undefined) {
    findings.push({
      code: "layout/innerwidth-spawn",
      file: "game.js",
      fix: "spawn inside stage.play (capped centered column) for identical challenge on every screen",
      line: spawnLine,
      message: "spawn uses raw innerWidth",
      recipe: "frogoe-core → contract",
      severity: "warning",
    });
  }

  // stage geometry is LIVE: destructuring it into a const freezes the
  // boot-time viewport — free-size desktop windows and the iOS keyboard
  // both change it mid-run, and everything derived from the const goes
  // stale (entities outside the play column, off-center furniture).
  // Helper calls (const { w } = layout()) re-read per tick and are fine.
  const cachedGeometryLine = gameLine(
    /const\s*\{[^}]*\b(?:width|height|left|right|center)\b[^}]*\}\s*=\s*stage(?:\.play)?\s*;?/u,
  );
  if (cachedGeometryLine !== undefined) {
    findings.push({
      code: "stage/cached-metrics",
      file: "game.js",
      fix: "stage geometry is live — re-read stage.play/stage.height every frame (a layout() helper per tick) or store normalized coords and remap on change; a const snapshot goes stale the moment the viewport changes",
      line: cachedGeometryLine,
      message: "stage geometry destructured into a const — frozen at boot, stale after any resize",
      recipe: "frogoe-core → viewport doctrine",
      severity: "error",
    });
  }

  // tuned-% anchors: a top: 44% that LOOKS centered on the phone it was
  // tuned on drifts on every other geometry. Centering is structural.
  const magicAnchorLine = findLine(
    index,
    /data-pos=[^>]*style="[^"]*\b(?:top|left|right|bottom)\s*:/u,
  );
  if (magicAnchorLine !== undefined) {
    findings.push({
      code: "hud/magic-anchor",
      file: "index.html",
      fix: "center overlays structurally — inset: 0 + display: grid + place-items: center (the registry overlay pattern); a tuned % only looks right on the geometry it was tuned for",
      line: magicAnchorLine,
      message:
        "data-pos wrapper carries an inline offset — tuned positioning drifts with viewport size",
      recipe: "frogoe-registry → overlay blocks",
      severity: "warning",
    });
  }

  // the exact signature of the shipped iOS silence bug: gating resume on
  // suspended alone leaves non-standard "interrupted" contexts silent
  const suspendedLine = gameLine(/\.state\s*(?:===|==)\s*["']suspended["']/u);
  if (suspendedLine !== undefined && /AudioContext/u.test(game)) {
    findings.push({
      code: "audio/suspended-only",
      file: "game.js",
      fix: 'resume when state !== "running" — iOS reports a non-standard "interrupted" state (lock, call, tab switch) that === "suspended" silently misses (frogoe-core → references/audio.md)',
      line: suspendedLine,
      message: "audio resume gates on suspended only — interrupted contexts stay silent",
      recipe: "frogoe-core → references/audio.md",
      severity: "warning",
    });
  }

  // block binding orphans: selectors in game.js must exist in markup
  const blocksDir = path.join(dir, "blocks");
  let markup = index;
  if (existsSync(blocksDir)) {
    for (const f of readdirSync(blocksDir)) {
      if (f.endsWith(".html")) {
        markup += read(path.join(blocksDir, f));
      }
    }
  }
  const wanted = new Set(
    [...game.matchAll(/\[(data-block-[a-z0-9-]+)\]/gu)].map((m) => m[1] ?? ""),
  );
  for (const binding of wanted) {
    if (binding && !markup.includes(binding)) {
      findings.push({
        code: "blocks/binding-orphan",
        file: "game.js",
        fix: `no element carries ${binding} — paste the block markup (frogoe add) or drop the selector`,
        message: `selector ${binding} targets nothing`,
        severity: "warning",
      });
    }
  }
};

/** The contract version this lint judges against. Moves in lockstep with
 *  packages/cli/src/templates.ts CONTRACT_VERSION — the lockstep script
 *  verifies the two can never drift. */
const LATEST_CONTRACT = "0.2.0";

const versionLt = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return false;
};

const checkPin = (dir: string, findings: Finding[]): void => {
  const pinFile = path.join(dir, "frogoe.json");
  if (!existsSync(pinFile)) {
    findings.push({
      code: "folder/contract-pin",
      file: "frogoe.json",
      fix: '{"contract": "0.2.0"} — the single version source of truth',
      message: "no frogoe.json pin",
      severity: "error",
    });
    return;
  }
  let pin = "";
  try {
    pin = String((JSON.parse(read(pinFile)) as { contract?: string }).contract ?? "");
  } catch {
    // fall through to empty pin
  }
  const contract = read(path.join(dir, ".frogoe/contract.js"));
  const marker = /frogoe contract v([\d.]+)/u.exec(contract.slice(0, 400));
  if (!contract) {
    findings.push({
      code: "folder/contract-pin",
      file: ".frogoe/contract.js",
      fix: "run frogoe init --force (rematerializes .frogoe/ from the pin)",
      message: "contract not materialized",
      severity: "error",
    });
  } else if (!marker || marker[1] !== pin) {
    findings.push({
      code: "folder/contract-pin",
      file: ".frogoe/contract.js",
      fix: `frogoe.json pins ${pin || "(none)"} but .frogoe carries ${marker?.[1] ?? "no marker"} — run frogoe init --force`,
      message: "contract version drift",
      severity: "error",
    });
  } else if (versionLt(pin, LATEST_CONTRACT)) {
    findings.push({
      code: "folder/contract-stale",
      file: "frogoe.json",
      fix: `contract ${LATEST_CONTRACT} is current (keyboard input, multi-touch, hover) — bump the pin and run frogoe init --force`,
      message: `pinned contract ${pin} predates ${LATEST_CONTRACT}`,
      recipe: "frogoe-core → contract (versioning)",
      severity: "warning",
    });
  }
};

export const checkProject = (dir: string): CheckResult => {
  const findings: Finding[] = [];
  checkArt(dir, findings);
  const brief = checkBrief(dir, findings);
  checkFolder(dir, findings, brief);
  checkPin(dir, findings);
  findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0));
  return {
    errors: findings.filter((f) => f.severity === "error").length,
    findings,
    warnings: findings.filter((f) => f.severity === "warning").length,
  };
};

export const formatFindings = (result: CheckResult): string =>
  result.findings
    .map((f) => {
      const at = f.line !== undefined ? `:${f.line}` : "";
      const head = `${f.severity === "error" ? "✖" : "⚠"} ${f.code}  ${f.file}${at}`;
      return `${head}\n    ${f.message}\n    fix: ${f.fix}`;
    })
    .join("\n") || "clean — 0 findings";
