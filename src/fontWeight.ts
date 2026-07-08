// CSS `font-weight` only accepts: normal | bold | bolder | lighter | 100–900. It does NOT
// accept face names like "light" / "medium" / "semibold" — those silently render as normal.
// Map the common friendly names to numbers so config `font_weight = "light"` actually works
// (e.g. renders Segoe UI Light). Numbers and the real CSS keywords pass straight through.
const NAMED: Record<string, string> = {
  thin: "100",
  hairline: "100",
  extralight: "200",
  ultralight: "200",
  light: "300",
  normal: "400",
  regular: "400",
  book: "400",
  medium: "500",
  semibold: "600",
  demibold: "600",
  bold: "700",
  extrabold: "800",
  ultrabold: "800",
  black: "900",
  heavy: "900",
};

export function cssFontWeight(w?: string | null): string | undefined {
  if (!w) return undefined;
  const key = w.toLowerCase().replace(/[\s_-]/g, "");
  return NAMED[key] ?? w;
}
