/**
 * Chart colours: the validated categorical palette (fixed order, never
 * cycled; a 9th series folds into "Other"), one sequential blue ramp, and the
 * chart surface. Stage colours are identity labels and are not used as series.
 */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"] as const;
export const OTHER = "#a8a29a";

/** Sequential blue, light → dark, for magnitude (heat maps). Start at 250 so the lightest cell still reads. */
export const BLUE_RAMP = ["#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"] as const;

export const SURFACE = "#FFFDF8";
export const GRID = "#E6DFCF";
export const TEXT = "#1A1C2E";
export const TEXT_2 = "#4A4E66";
export const MUTED = "#6B6F86";

/** Colour per category in first-seen order, folding past 8 into Other. */
export function categoryColors(keys: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const k of keys) if (!m.has(k)) m.set(k, m.size < SERIES.length ? SERIES[m.size] : OTHER);
  return m;
}

export function rampColor(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "transparent";
  const i = Math.min(BLUE_RAMP.length - 1, Math.floor((value / max) * (BLUE_RAMP.length - 1)));
  return BLUE_RAMP[i];
}
