/**
 * One plain line per finished test, for the "what we checked" row and the
 * activity log. Pure functions of the stored stage reports.
 */
import type { BreakdownReport } from "../stages/breakdown";
import type { BudgetReport } from "../stages/budget";
import type { ContinuityReport } from "../stages/continuity";
import type { IntakeReport } from "../stages/intake";
import type { LocationsReport } from "../stages/locations";
import type { ScheduleReport } from "../stages/schedule";
import type { Skipped, StoryReport } from "../stages/story";
import type { StoryTestReport } from "../stages/story-test";
import type { StageView } from "./runs";

export const TEST_LABEL: Record<string, string> = {
  story_test: "Story read",
  intake: "Pages and format",
  story: "Structure",
  continuity: "Continuity",
  breakdown: "Breakdown",
  locations: "Places",
  schedule: "Schedule",
  budget: "Budget",
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function summaryOf(stage: StageView): string {
  const r = stage.report as Record<string, unknown> | null;
  if (!r) return "";
  if ("skipped" in r) return String((r as unknown as Skipped).skipped);
  switch (stage.id) {
    case "story_test": {
      const s = r as unknown as StoryTestReport;
      return `${s.beats.filter((b) => b.present).length} of 15 beats · ${plural(s.questions.length, "question")} to answer`;
    }
    case "intake": {
      const s = r as unknown as IntakeReport;
      return `${plural(s.scenes.length, "scene")} · ${s.totalPages} pages · about ${plural(Math.max(1, s.runtimeMinutes), "minute")}`;
    }
    case "story": {
      const s = r as unknown as StoryReport;
      const turns = s.scenes.filter((x) => !x.turns).length;
      return `${s.beats.filter((b) => b.timing !== "missing").length} of 15 beats land · ${plural(turns, "scene")} ${turns === 1 ? "does" : "do"} not turn`;
    }
    case "continuity": {
      const s = r as unknown as ContinuityReport;
      return s.findings.open ? `${plural(s.findings.open, "open conflict")} · ${s.findings.bySeverity.high} high` : "No open conflicts";
    }
    case "breakdown": {
      const s = r as unknown as BreakdownReport;
      return `${plural(s.alerts.length, "department alert")} · ${s.alerts.filter((a) => a.severity === "high").length} high`;
    }
    case "locations": {
      const s = r as unknown as LocationsReport;
      return `${plural(s.sets.length, "set")} · ${plural(s.flags.length, "flag")}`;
    }
    case "schedule": {
      const s = r as unknown as ScheduleReport;
      return `${plural(s.totals.shootDays, "shoot day")} · ${plural(s.checks.length, "check")} raised`;
    }
    case "budget": {
      const s = r as unknown as BudgetReport;
      return `About ${new Intl.NumberFormat("en", { style: "currency", currency: s.currency, maximumFractionDigits: 0 }).format(s.total)} (rough)`;
    }
    default:
      return "";
  }
}
