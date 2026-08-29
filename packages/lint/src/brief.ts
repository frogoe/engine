/** BRIEF.md frontmatter parser — pure, no deps. */
export interface Brief {
  accent?: string;
  bg?: string;
  fg?: string;
  mood?: string;
  outline?: string;
  title?: string;
  verb?: string;
}

const stripComment = (value: string): string =>
  value
    .replace(/\s+#.*$/u, "")
    .trim()
    .replace(/^["']|["']$/gu, "");

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
    const nested = /^\s{2,}([a-z-]+):\s*(.*)$/u.exec(rawLine);
    const top = /^([a-z-]+):\s*(.*)$/u.exec(rawLine);
    if (nested && section === "palette") {
      const key = nested[1] as keyof Brief;
      (brief[key] as string) = stripComment(nested[2] ?? "");
      continue;
    }
    if (top) {
      section = top[1] ?? "";
      if (section === "palette") {
        continue;
      }
      const key = section as keyof Brief;
      (brief[key] as string) = stripComment(top[2] ?? "");
    }
  }
  return brief;
};
