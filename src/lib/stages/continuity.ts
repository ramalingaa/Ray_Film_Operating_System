/**
 * Stage 3 — Continuity. Reads every scene into the story graph (the same
 * extraction later stages use), then runs the eight continuity checks.
 * Resumable: extraction and verdicts are cached, so a step that runs out of
 * time continues where it stopped.
 */
import { eq } from "drizzle-orm";
import { runChecks } from "../checks/run";
import { findings } from "../db/schema";
import { ingest } from "../pipeline/ingest";
import { scriptDocName, type StageDef } from "./types";

export interface ContinuityReport {
  docId: number;
  /** This production's own costume and location sheets (empty when none were given). */
  sheetDocIds?: number[];
  sceneCount: number;
  extraction: { extracted: number; cached: number; skipped: number; dropped: number; model: boolean };
  findings: { total: number; open: number; bySeverity: Record<"high" | "medium" | "low", number>; byCheck: Record<string, number> };
  judge: { candidates: number; accepted: number; rejected: number; unjudged: number };
  failedChecks: { id: string; error: string }[];
}

export const continuityStage: StageDef<ContinuityReport> = {
  id: "continuity",
  title: "Continuity",
  summary: "Read every scene into the story graph and run the eight continuity checks.",
  async step({ ctx, run, judgeSettings, deadline }) {
    if (!run.scriptText) throw new Error("intake has not produced a script yet");
    const file = (name: string | null, text: string | null) => (name && text ? { name, text } : undefined);
    const r = await ingest(
      ctx,
      { script: { name: scriptDocName(run), text: run.scriptText }, costumes: file(run.costumesName, run.costumesText), locations: file(run.locationsName, run.locationsText) },
      { deadline },
    );
    if (r.skippedScenes > 0) {
      // A partly read script is not a tested script: fail, so the chapter cannot be approved on it.
      // Retrying re-reads only these scenes; the others are cached.
      throw new Error(
        `${r.skippedScenes} of ${r.sceneCount} scenes could not be read by any model (see Pipeline health for the reason, often an exhausted model quota). Try again once the model is available.`,
      );
    }
    if (r.deferredScenes > 0) {
      return { done: false, progress: `read ${r.sceneCount - r.deferredScenes} of ${r.sceneCount} scenes`, runPatch: { scriptDocId: r.scriptDocId } };
    }

    const sheetDocIds = [r.costumeDocId, r.locationDocId].filter((x): x is number => x != null);
    const s = await runChecks(ctx.db, r.scriptDocId, { judgeCtx: ctx, judgeSettings, deadline, sheetDocIds });
    if (s.judge.deferred > 0) {
      const judged = s.judge.accepted + s.judge.rejected;
      return { done: false, progress: `judged ${judged} of ${judged + s.judge.deferred} possible conflicts`, runPatch: { scriptDocId: r.scriptDocId } };
    }

    const rows = await ctx.db.select({ severity: findings.severity, status: findings.status }).from(findings).where(eq(findings.docId, r.scriptDocId));
    const bySeverity = { high: 0, medium: 0, low: 0 };
    for (const f of rows) if (f.status !== "dismissed_intentional") bySeverity[f.severity]++;
    return {
      done: true,
      runPatch: { scriptDocId: r.scriptDocId },
      report: {
        docId: r.scriptDocId,
        sheetDocIds,
        sceneCount: r.sceneCount,
        extraction: { extracted: r.extractedScenes, cached: r.cachedScenes, skipped: r.skippedScenes, dropped: r.droppedItems, model: !!ctx.gateway },
        findings: { total: s.total, open: s.open, bySeverity, byCheck: s.byCheck },
        judge: { candidates: s.judge.candidates, accepted: s.judge.accepted, rejected: s.judge.rejected, unjudged: s.judge.unjudged },
        failedChecks: s.failedChecks,
      },
    };
  },
};
