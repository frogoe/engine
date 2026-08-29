/** WCAG contrast math for hex colors — pure, no deps. */
const HEX = /^#[0-9a-fA-F]{3,8}$/u;
export const isHex = (value: string): boolean => HEX.test(value);

export const contrastRatio = (a: string, b: string): number => {
  const lum = (hex: string): number => {
    const full = hex.length === 4 ? `#${hex.slice(1).replace(/(.)/gu, "$1$1")}` : hex;
    const n = Number.parseInt(full.slice(1), 16);
    const rgb = [16, 8, 0].map((shift) => ((n >> shift) & 255) / 255);
    const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
  };
  try {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
    return (l1 + 0.05) / (l2 + 0.05);
  } catch {
    return 21;
  }
};
