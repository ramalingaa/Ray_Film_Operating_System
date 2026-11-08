import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { runStages, type RunStage } from "../db/schema";

/** The finished report of an earlier stage of the same run (throws if it is not done). */
export async function stageReport<T>(db: Db, runId: number, stage: RunStage): Promise<T> {
  const [row] = await db.select().from(runStages).where(and(eq(runStages.runId, runId), eq(runStages.stage, stage)));
  if (!row || row.status !== "done" || !row.reportJson) throw new Error(`the ${stage} stage has not finished yet`);
  return JSON.parse(row.reportJson) as T;
}
