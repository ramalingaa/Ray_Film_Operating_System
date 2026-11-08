import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { runs, runStages, type RunStage } from "../db/schema";
import { getStage } from "../stages";

export interface StageView {
  id: RunStage;
  title: string;
  summary: string;
  status: "pending" | "running" | "done" | "failed";
  progress: string | null;
  error: string | null;
  report: unknown;
  finishedAt: string | null;
}

export interface RunView {
  id: number;
  title: string;
  inputKind: "screenplay" | "story";
  sourceName: string;
  status: "queued" | "running" | "done" | "failed";
  scriptText: string | null;
  scriptGenerated: boolean;
  scriptDocId: number | null;
  createdAt: string;
  stages: StageView[];
}

export async function listRuns(db: Db, limit = 30) {
  const rows = await db
    .select({ id: runs.id, title: runs.title, inputKind: runs.inputKind, status: runs.status, createdAt: runs.createdAt, sourceName: runs.sourceName })
    .from(runs)
    .orderBy(desc(runs.id))
    .limit(limit);
  const ids = rows.map((r) => r.id);
  const stageRows = ids.length
    ? await db.select({ runId: runStages.runId, status: runStages.status }).from(runStages).where(inArray(runStages.runId, ids))
    : [];
  return rows.map((r) => {
    const st = stageRows.filter((s) => s.runId === r.id);
    return { ...r, stagesDone: st.filter((s) => s.status === "done").length, stagesTotal: st.length };
  });
}

export async function loadRun(db: Db, id: number): Promise<RunView | undefined> {
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) return undefined;
  const rows = await db.select().from(runStages).where(eq(runStages.runId, id)).orderBy(asc(runStages.ordinal));
  return {
    id: run.id,
    title: run.title,
    inputKind: run.inputKind,
    sourceName: run.sourceName,
    status: run.status,
    scriptText: run.scriptText,
    scriptGenerated: run.scriptGenerated,
    scriptDocId: run.scriptDocId,
    createdAt: run.createdAt,
    stages: rows.map((r) => {
      const def = getStage(r.stage);
      return {
        id: r.stage,
        title: def?.title ?? r.stage,
        summary: def?.summary ?? "",
        status: r.status,
        progress: r.progress,
        error: r.error,
        report: r.reportJson ? JSON.parse(r.reportJson) : null,
        finishedAt: r.finishedAt,
      };
    }),
  };
}
