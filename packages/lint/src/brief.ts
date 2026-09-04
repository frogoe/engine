/** BRIEF.md frontmatter parser — pure, no deps.
 *
 *  Linear scans only: every pattern here is a single anchored character
 *  class with no overlapping quantifiers. The previous forms (\s+#.*$,
 *  ^\s{2,}key:\s*(.*), and the like) backtrack quadratically on
 *  whitespace-heavy input (CodeQL: js/polynomial-redos). */
export interface Brief {
  accent?: string;
  bg?: string;
  fg?: string;
  mood?: string;
  outline?: string;
  title?: string;
  verb?: string;
}

const KEY_PATTERN = /^[a-z-]+$/u;
const WS = /\s/u;

/** Strip a trailing `# comment` (whitespace before the hash) and wrapping
 *  quotes. Manual O(n) scan — no backtracking. */
const stripComment = (value: string): string => {
  let cut = -1;
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === "#" && WS.test(value[i - 1] ?? "")) {
      cut = i;
      break;
    }
  }
  return (cut === -1 ? value : value.slice(0, cut)).trim().replace(/^["']|["']$/gu, "");
};

/** One frontmatter line: leading indent, the key before the first colon,
 *  and everything after it. The linear equivalent of the old
 *  `^\s{2,}key:\s*(.*)` / `^key:\s*(.*)` regex pair. */
const parseLine = (line: string): { indent: number; key: string; rest: string } | null => {
  let indent = 0;
  while (indent < line.length && line[indent] === " ") indent += 1;
  const body = line.slice(indent);
  const colon = body.indexOf(":");
  if (colon === -1) return null;
  const key = body.slice(0, colon);
  if (!KEY_PATTERN.test(key)) return null;
  return { indent, key, rest: body.slice(colon + 1) };
};

export const parseBrief = (source: string): Brief | null => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/u.exec(source);
  if (!match) {
    return null;
  }
  const brief: Brief = {};
  let section = "";
  for (const rawLine of match[1]?.split("\n") ?? []) {
    if (rawLine.trim() === "") {
      continue;
    }
    const parsed = parseLine(rawLine);
    if (!parsed) {
      continue;
    }
    if (parsed.indent >= 2 && section === "palette") {
      (brief[parsed.key as keyof Brief] as string) = stripComment(parsed.rest);
      continue;
    }
    if (parsed.indent === 0) {
      section = parsed.key;
      if (section === "palette") {
        continue;
      }
      (brief[parsed.key as keyof Brief] as string) = stripComment(parsed.rest);
    }
  }
  return brief;
};
