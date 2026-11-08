import { and, desc, eq } from "drizzle-orm";
import type { AgentContext } from "../agents/runtime";
import type { JudgeSettings } from "../checks/judge";
import { runChecks } from "../checks/run";
import { documents, scenes } from "../db/schema";
import { ingest, type SourceFile } from "../pipeline/ingest";
import { computeImpact, replaceSceneText, type ImpactReport } from "./impact";

async function latestSheet(ctx: AgentContext, kind: "costume_sheet" | "location_sheet"): Promise<SourceFile | undefined> {
  const [d] = await ctx.db.select().from(documents).where(eq(documents.kind, kind)).orderBy(desc(documents.id)).limit(1);
  return d ? { name: d.name, text: d.rawText } : undefined;
}

/**
 * Ingest `newText` as the next version of the script `baseDocId`, re-run the
 * checks on both versions, and report the impact. Only scenes whose text
 * changed are re-extracted (the extraction cache is keyed on scene text).
 */
export async function applyScriptEdit(
  ctx: AgentContext,
  baseDocId: number,
  newText: string,
  judgeSettings?: JudgeSettings,
): Promise<ImpactReport & { modelCalls: { extractedScenes: number; cachedScenes: number } }> {
  const [base] = await ctx.db.select().from(documents).where(and(eq(documents.id, baseDocId), eq(documents.kind, "script")));
  if (!base) throw new Error(`script document ${baseDocId} not found`);

  const report = await ingest(ctx, {
    script: { name: base.name, text: newText },
    costumes: await latestSheet(ctx, "costume_sheet"),
    locations: await latestSheet(ctx, "location_sheet"),
  });
  const judged = { judgeCtx: ctx, judgeSettings };
  await runChecks(ctx.db, baseDocId, judged);
  await runChecks(ctx.db, report.scriptDocId, judged);
  return { ...(await computeImpact(ctx.db, baseDocId, report.scriptDocId)), modelCalls: { extractedScenes: report.extractedScenes - report.cachedScenes, cachedScenes: report.cachedScenes } };
}

/** Edit one scene's text and apply it as a new script version. */
export async function applySceneEdit(ctx: AgentContext, baseDocId: number, sceneNumber: string, sceneText: string, judgeSettings?: JudgeSettings) {
  const [base] = await ctx.db.select().from(documents).where(eq(documents.id, baseDocId));
  const [scene] = await ctx.db.select().from(scenes).where(and(eq(scenes.docId, baseDocId), eq(scenes.number, sceneNumber)));
  if (!base || !scene) throw new Error(`scene ${sceneNumber} not found in document ${baseDocId}`);
  return applyScriptEdit(ctx, baseDocId, replaceSceneText(base.rawText, scene, sceneText), judgeSettings);
}
