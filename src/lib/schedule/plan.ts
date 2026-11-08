/**
 * A draft shooting schedule by a simple, explainable heuristic (not an
 * optimizer): split scenes into day and night work, group each by set to
 * minimize company moves, and pack them into shoot days up to a page budget.
 * Pure functions.
 */

export type Light = "day" | "night";

export interface Strip {
  scene: string;
  set: string;
  intExt: string;
  time: string;
  light: Light;
  eighths: number;
  cast: string[];
  /** Line of the scene heading, for citations. */
  line: number;
  heading: string;
}

export interface ShootDay {
  day: number;
  light: Light;
  strips: Strip[];
  eighths: number;
  sets: string[];
}

const NIGHT = /NIGHT/i;
const CARRY = /CONTINUOUS|MOMENTS LATER|LATER|SAME|CONT/i;

/** Day or night work for each scene; CONTINUOUS and similar inherit the previous scene's light. */
export function lightOf(times: string[]): Light[] {
  const out: Light[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    out.push(CARRY.test(t) && !NIGHT.test(t) && i > 0 ? out[i - 1] : NIGHT.test(t) ? "night" : "day");
  }
  return out;
}

export function planDays(strips: Strip[], eighthsPerDay: number): ShootDay[] {
  const days: ShootDay[] = [];
  for (const light of ["day", "night"] as const) {
    const pool = strips.filter((s) => s.light === light);
    // Biggest sets first; scenes keep script order within a set.
    const bySet = new Map<string, Strip[]>();
    for (const s of pool) bySet.set(s.set, [...(bySet.get(s.set) ?? []), s]);
    const ordered = [...bySet.values()].sort((a, b) => b.reduce((n, s) => n + s.eighths, 0) - a.reduce((n, s) => n + s.eighths, 0)).flat();
    let current: ShootDay | undefined;
    for (const s of ordered) {
      if (!current || (current.eighths > 0 && current.eighths + s.eighths > eighthsPerDay)) {
        current = { day: days.length + 1, light, strips: [], eighths: 0, sets: [] };
        days.push(current);
      }
      current.strips.push(s);
      current.eighths += s.eighths;
      if (!current.sets.includes(s.set)) current.sets.push(s.set);
    }
  }
  return days;
}

export interface CastDays {
  name: string;
  workDays: number[];
  first: number;
  last: number;
  /** Days between first and last on which they do not work but are usually paid to hold. */
  holdDays: number[];
}

export function dayOutOfDays(days: ShootDay[]): CastDays[] {
  const work = new Map<string, Set<number>>();
  for (const d of days) for (const s of d.strips) for (const c of s.cast) work.set(c, (work.get(c) ?? new Set()).add(d.day));
  return [...work]
    .map(([name, set]) => {
      const workDays = [...set].sort((a, b) => a - b);
      const first = workDays[0];
      const last = workDays[workDays.length - 1];
      const holdDays: number[] = [];
      for (let d = first; d <= last; d++) if (!set.has(d)) holdDays.push(d);
      return { name, workDays, first, last, holdDays };
    })
    .sort((a, b) => b.workDays.length - a.workDays.length || a.name.localeCompare(b.name));
}
