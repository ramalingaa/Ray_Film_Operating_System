/**
 * Stage 6 — Schedule. A draft stripboard and day-out-of-days from the
 * breakdown and locations, then the checks schedulers most often miss.
 * Code only; the page budget per day is configurable (SCHEDULE_PAGES_PER_DAY).
 */
import { minorMatcher } from "../breakdown/rules";
import { formatEighths } from "../intake/pages";
import { dayOutOfDays, lightOf, planDays, type CastDays, type ShootDay, type Strip } from "../schedule/plan";
import type { BreakdownReport } from "./breakdown";
import type { IntakeReport } from "./intake";
import type { LocationsReport } from "./locations";
import { stageReport } from "./reports";
import type { Cite, StageDef } from "./types";

export interface ScheduleCheck {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  cites: Cite[];
}

export interface ScheduleReport {
  eighthsPerDay: number;
  days: (Omit<ShootDay, "strips"> & { pages: string; strips: (Strip & { pages: string })[] })[];
  dood: CastDays[];
  totals: { shootDays: number; dayDays: number; nightDays: number; companyMoves: number };
  checks: ScheduleCheck[];
  assumptions: string[];
}

export function eighthsPerDayFromEnv(env: Record<string, string | undefined> = process.env): number {
  const pages = Number(env.SCHEDULE_PAGES_PER_DAY);
  return Math.round((Number.isFinite(pages) && pages > 0 ? pages : 5) * 8);
}

export const scheduleStage: StageDef<ScheduleReport> = {
  id: "schedule",
  title: "Schedule",
  summary: "A draft shooting order by set and day/night, a day-out-of-days for cast, and turnaround, child-hours and holding-day checks.",
  async step({ ctx, run }) {
    const [intake, breakdown, locations] = await Promise.all([
      stageReport<IntakeReport>(ctx.db, run.id, "intake"),
      stageReport<BreakdownReport>(ctx.db, run.id, "breakdown"),
      stageReport<LocationsReport>(ctx.db, run.id, "locations"),
    ]);
    const eighthsPerDay = eighthsPerDayFromEnv();
    const setOf = new Map(locations.sets.flatMap((s) => s.scenes.map((n) => [n, s.name] as const)));
    const lineOf = new Map(intake.scenes.map((s) => [s.number, s.startLine]));
    const lights = lightOf(breakdown.scenes.map((s) => s.time));
    const strips: Strip[] = breakdown.scenes.map((s, i) => ({
      scene: s.number,
      set: setOf.get(s.number) ?? s.heading,
      intExt: s.intExt,
      time: s.time,
      light: lights[i],
      eighths: s.eighths,
      cast: s.cast,
      line: lineOf.get(s.number) ?? 0,
      heading: s.heading,
    }));
    const days = planDays(strips, eighthsPerDay);
    const dood = dayOutOfDays(days);
    const docName = run.scriptGenerated ? "generated outline" : run.sourceName;
    const cite = (s: Strip): Cite => ({ docName, line: s.line, snippet: s.heading, sceneNumber: s.scene });

    const checks: ScheduleCheck[] = [];
    // Night work followed by day work without a rest day.
    for (let i = 0; i + 1 < days.length; i++) {
      if (days[i].light === "night" && days[i + 1].light === "day") {
        checks.push({
          severity: "medium",
          title: `Night-to-day turnaround after shoot day ${days[i].day}`,
          detail: "Cast and crew need their full rest period (often 10–12 hours) before a day call. Add a rest day or move the night work.",
          cites: [cite(days[i].strips[0]), cite(days[i + 1].strips[0])],
        });
      }
    }
    // Children on a night shoot day.
    const isMinorCast = minorMatcher(breakdown.scenes.flatMap((s) => s.elements.filter((e) => e.category === "minor").map((e) => e.item)));
    for (const d of days.filter((x) => x.light === "night")) {
      const kids = [...new Set(d.strips.flatMap((s) => s.cast.filter(isMinorCast)))];
      if (kids.length) {
        checks.push({
          severity: "high",
          title: `Child performer${kids.length > 1 ? "s" : ""} on night shoot day ${d.day}`,
          detail: `${kids.join(", ")}. Child work-hour rules usually forbid or limit night work.`,
          cites: d.strips.filter((s) => s.cast.some(isMinorCast)).map(cite),
        });
      }
    }
    // A scene longer than a whole day.
    for (const s of strips.filter((x) => x.eighths > eighthsPerDay)) {
      checks.push({ severity: "medium", title: `Scene ${s.scene} is longer than a shoot day`, detail: `${formatEighths(s.eighths)} pages against a ${formatEighths(eighthsPerDay)}-page day. Plan it across days.`, cites: [cite(s)] });
    }
    // Too many company moves in one day.
    for (const d of days.filter((x) => x.sets.length > 2)) {
      checks.push({ severity: "medium", title: `${d.sets.length - 1} company moves on shoot day ${d.day}`, detail: `Sets: ${d.sets.join(", ")}. Each move costs one to two hours.`, cites: d.strips.map(cite).slice(0, 4) });
    }
    // Paid holding days.
    for (const c of dood.filter((x) => x.holdDays.length > 0)) {
      checks.push({
        severity: c.holdDays.length >= 2 ? "medium" : "low",
        title: `${c.name}: ${c.holdDays.length} holding day${c.holdDays.length > 1 ? "s" : ""}`,
        detail: `Works days ${c.workDays.join(", ")}; idle on day${c.holdDays.length > 1 ? "s" : ""} ${c.holdDays.join(", ")} but usually paid. Group their scenes to save the hold.`,
        cites: [],
      });
    }
    const rank = { high: 0, medium: 1, low: 2 };
    checks.sort((a, b) => rank[a.severity] - rank[b.severity]);

    return {
      done: true,
      report: {
        eighthsPerDay,
        days: days.map((d) => ({ ...d, pages: formatEighths(d.eighths), strips: d.strips.map((s) => ({ ...s, pages: formatEighths(s.eighths) })) })),
        dood,
        totals: {
          shootDays: days.length,
          dayDays: days.filter((d) => d.light === "day").length,
          nightDays: days.filter((d) => d.light === "night").length,
          companyMoves: days.reduce((n, d) => n + d.sets.length - 1, 0),
        },
        checks,
        assumptions: [
          `Up to ${formatEighths(eighthsPerDay)} pages per shoot day (set SCHEDULE_PAGES_PER_DAY to change).`,
          "Day and night work are scheduled on separate days; all day work first, then nights, so there is no night-to-day turnaround in this draft.",
          "Scenes are grouped by set, largest set first, keeping script order within a set.",
          "Cast availability, actor stop dates, weather cover and travel are not known to this draft.",
        ],
      },
    };
  },
};
