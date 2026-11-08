/**
 * Blake Snyder's 15 beats with the stretch of the script where each usually
 * lands, as a fraction of the script from the first scene to the last line.
 * The ranges are deliberately generous: a beat is flagged only when it is
 * clearly early, late, missing, or out of order.
 */

export const BEATS = [
  { id: "opening_image", title: "Opening Image", range: [0, 0.06] },
  { id: "theme_stated", title: "Theme Stated", range: [0, 0.15] },
  { id: "set_up", title: "Set-Up", range: [0, 0.15] },
  { id: "catalyst", title: "Catalyst", range: [0.04, 0.2] },
  { id: "debate", title: "Debate", range: [0.08, 0.3] },
  { id: "break_into_two", title: "Break into Two", range: [0.15, 0.35] },
  { id: "b_story", title: "B Story", range: [0.18, 0.45] },
  { id: "fun_and_games", title: "Fun and Games", range: [0.22, 0.58] },
  { id: "midpoint", title: "Midpoint", range: [0.38, 0.65] },
  { id: "bad_guys_close_in", title: "Bad Guys Close In", range: [0.48, 0.82] },
  { id: "all_is_lost", title: "All Is Lost", range: [0.6, 0.88] },
  { id: "dark_night_of_the_soul", title: "Dark Night of the Soul", range: [0.62, 0.92] },
  { id: "break_into_three", title: "Break into Three", range: [0.7, 0.94] },
  { id: "finale", title: "Finale", range: [0.72, 1] },
  { id: "final_image", title: "Final Image", range: [0.9, 1] },
] as const;

export type BeatId = (typeof BEATS)[number]["id"];
export const BEAT_IDS = BEATS.map((b) => b.id) as unknown as readonly [BeatId, ...BeatId[]];

/** Beats that are points in time and should appear in this order. */
export const ORDERED_BEATS: BeatId[] = ["catalyst", "break_into_two", "midpoint", "all_is_lost", "break_into_three", "final_image"];

/** Under this many pages, the 15-beat timings are guidance only. */
export const SHORT_FORM_PAGES = 30;

export type BeatTiming = "on_time" | "early" | "late" | "missing";

export function beatTiming(id: BeatId, position: number | null): BeatTiming {
  if (position == null) return "missing";
  const b = BEATS.find((x) => x.id === id)!;
  if (position < b.range[0]) return "early";
  if (position > b.range[1]) return "late";
  return "on_time";
}

/** Pairs of ordered beats that appear in the wrong order. */
export function outOfOrder(positions: Partial<Record<BeatId, number>>): [BeatId, BeatId][] {
  const present = ORDERED_BEATS.filter((b) => positions[b] != null);
  const pairs: [BeatId, BeatId][] = [];
  for (let i = 0; i < present.length - 1; i++) {
    const a = present[i];
    const b = present[i + 1];
    if (positions[a]! > positions[b]!) pairs.push([a, b]);
  }
  return pairs;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
