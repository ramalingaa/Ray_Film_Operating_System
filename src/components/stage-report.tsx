import type { ReactNode } from "react";
import { BreakdownReportView } from "@/components/reports/breakdown-report";
import { BudgetReportView } from "@/components/reports/budget-report";
import { ContinuityReportView } from "@/components/reports/continuity-report";
import { IntakeReportView } from "@/components/reports/intake-report";
import { LocationsReportView } from "@/components/reports/locations-report";
import { ScheduleReportView } from "@/components/reports/schedule-report";
import { StoryReportView } from "@/components/reports/story-report";
import { StoryTestReportView } from "@/components/reports/story-test-report";
import type { Db } from "@/lib/db/client";
import type { BreakdownReport } from "@/lib/stages/breakdown";
import type { BudgetReport } from "@/lib/stages/budget";
import type { ContinuityReport } from "@/lib/stages/continuity";
import type { IntakeReport } from "@/lib/stages/intake";
import type { LocationsReport } from "@/lib/stages/locations";
import type { ScheduleReport } from "@/lib/stages/schedule";
import type { Skipped, StoryReport } from "@/lib/stages/story";
import type { StoryTestReport } from "@/lib/stages/story-test";
import { loadReview } from "@/lib/ui/queries";
import type { RunView, StageView } from "@/lib/ui/runs";
import { presenceFor } from "@/lib/ui/visuals";

/** A finished stage's report, shared by the chapter view and the agent workspace. */
export async function StageReport({ stage, run, db }: { stage: StageView; run: RunView; db: Db }): Promise<ReactNode> {
  switch (stage.id) {
    case "story_test":
      return <StoryTestReportView r={stage.report as StoryTestReport | Skipped} />;
    case "intake":
      return <IntakeReportView r={stage.report as IntakeReport} scriptText={run.scriptText} presence={run.scriptDocId ? await presenceFor(db, run.scriptDocId) : undefined} />;
    case "story":
      return <StoryReportView r={stage.report as StoryReport | Skipped} />;
    case "continuity": {
      const r = stage.report as ContinuityReport;
      return <ContinuityReportView r={r} review={await loadReview(db, r.docId)} />;
    }
    case "breakdown":
      return <BreakdownReportView r={stage.report as BreakdownReport} />;
    case "locations":
      return <LocationsReportView r={stage.report as LocationsReport} />;
    case "schedule":
      return <ScheduleReportView r={stage.report as ScheduleReport} />;
    case "budget":
      return <BudgetReportView r={stage.report as BudgetReport} />;
    default:
      return null;
  }
}
