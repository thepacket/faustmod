/** Header glow accent per component category, giving each group a distinct identity. */
const ACCENTS: Record<string, string> = {
  Sources: "#57d977",
  Filters: "#4c9dff",
  Dynamics: "#f2a13c",
  Time: "#b57bff",
  Utility: "#35d6c3",
  "I/O": "#ff6b81",
};

export const DEFAULT_ACCENT = "#57d977";

export function accentFor(category: string): string {
  return ACCENTS[category] ?? DEFAULT_ACCENT;
}
