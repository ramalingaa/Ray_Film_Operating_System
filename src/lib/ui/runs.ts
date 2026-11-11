import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client";
import { runs, runStages, type RunStage } from "../db/schema";
import { getStage, STAGES } from "../stages";
import { hasMaterial } from "../pipeline/runs";
import { CHAPTERS, runnableStages, type Chapter, type ChapterState } from "../stages/chapters";

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

export interface ChapterView extends Chapter {
  index: number;
  state: ChapterState;
  stageViews: StageView[];
  /** What the chapter is waiting on, when state is awaiting_input or working. */
  note: string | null;
}

export interface RunView {
  id: number;
  title: string;
  inputKind: "screenplay" | "story";
  sourceName: string;
  status: "queued" | "running" | "done" | "failed";
  storyText: string | null;
  scriptText: string | null;
  scriptMode: "adapt" | "own" | null;
  scriptGenerated: boolean;
  scriptDocId: number | null;
  approvedThrough: number;
  createdAt: string;
  stages: StageView[];
  chapters: ChapterView[];
  /** Index of the chapter that needs attention now (the first not approved), or the last when greenlit. */
  currentChapter: number;
  greenlit: boolean;
  /** False until the project has its story or screenplay (chat-first projects start without one). */
  hasMaterial: boolean;
}

export function chapterState(i: number, approvedThrough: number, storyText: string | null, stages: StageView[], material = true): { state: ChapterState; note: string | null } {
  if (!material) return i === 0 ? { state: "awaiting_input", note: "Waiting for your story or screenplay." } : { state: "locked", note: null };
  if (i === 0 && !storyText) return { state: "skipped", note: "Started from a screenplay." };
  if (i <= approvedThrough) return { state: "approved", note: null };
  if (i > approvedThrough + 1) return { state: "locked", note: null };
  const failed = stages.find((s) => s.status === "failed");
  if (failed) return { state: "failed", note: failed.error };
  const waiting = stages.find((s) => s.status === "running" && s.progress?.startsWith("Choose"));
  if (waiting) return { state: "awaiting_input", note: waiting.progress };
  if (stages.length && stages.every((s) => s.status === "done")) return { state: "ready", note: null };
  const running = stages.find((s) => s.status === "running");
  return { state: "working", note: running?.progress ?? null };
}

export async function listRuns(db: Db, limit = 30) {
  const rows = await db
    .select({
      id: runs.id,
      title: runs.title,
      inputKind: runs.inputKind,
      status: runs.status,
      createdAt: runs.createdAt,
      updatedAt: runs.updatedAt,
      sourceName: runs.sourceName,
      approvedThrough: runs.approvedThrough,
      storyText: runs.storyText,
    })
    .from(runs)
    .orderBy(desc(runs.id))
    .limit(limit);
  const ids = rows.map((r) => r.id);
  const stageRows = ids.length ? await db.select().from(runStages).where(inArray(runStages.runId, ids)) : [];
  return rows.map(({ storyText, ...r }) => {
    const greenlit = r.approvedThrough >= CHAPTERS.length - 1;
    const current = greenlit ? CHAPTERS.length - 1 : Math.max(0, r.approvedThrough + 1);
    const views = CHAPTERS[current].stages.flatMap((st) => {
      const row = stageRows.find((x) => x.runId === r.id && x.stage === st);
      return row ? [{ id: row.stage, title: row.stage, summary: "", status: row.status, progress: row.progress, error: row.error, report: null, finishedAt: row.finishedAt } satisfies StageView] : [];
    });
    const state = greenlit ? ("approved" as ChapterState) : chapterState(current, r.approvedThrough, storyText, views).state;
    return { ...r, greenlit, current, currentState: state, chaptersApproved: r.approvedThrough + 1, chaptersTotal: CHAPTERS.length };
  });
}

export async function loadRun(db: Db, id: number): Promise<RunView | undefined> {
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  if (!run) return undefined;
  const order = (stage: string) => {
    const i = STAGES.findIndex((s) => s.id === stage);
    return i < 0 ? STAGES.length : i;
  };
  const rows = (await db.select().from(runStages).where(eq(runStages.runId, id)).orderBy(asc(runStages.ordinal))).sort((a, b) => order(a.stage) - order(b.stage));
  const stages: StageView[] = rows.map((r) => {
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
  });
  // Stages added since the run last stepped are created (and run) on its next step.
  const missing = runnableStages(run.approvedThrough).some((s) => !rows.some((r) => r.stage === s));
  const status = run.status === "done" && missing ? "running" : run.status;

  const material = hasMaterial(run);
  const chapters: ChapterView[] = CHAPTERS.map((c, i) => {
    const stageViews = c.stages.map((st) => stages.find((s) => s.id === st)).filter((s): s is StageView => !!s);
    return { ...c, index: i, stageViews, ...chapterState(i, run.approvedThrough, run.storyText, stageViews, material) };
  });
  const greenlit = run.approvedThrough >= CHAPTERS.length - 1;
  return {
    id: run.id,
    title: run.title,
    inputKind: run.inputKind,
    sourceName: run.sourceName,
    status,
    storyText: run.storyText,
    scriptText: run.scriptText,
    scriptMode: run.scriptMode,
    scriptGenerated: run.scriptGenerated,
    scriptDocId: run.scriptDocId,
    approvedThrough: run.approvedThrough,
    createdAt: run.createdAt,
    stages,
    chapters,
    currentChapter: greenlit ? CHAPTERS.length - 1 : Math.max(0, run.approvedThrough + 1),
    greenlit,
    hasMaterial: material,
  };
}

/** Open findings across a chapter's reports, for the approval gate. */
export function openHighCount(chapter: ChapterView): number {
  let n = 0;
  for (const s of chapter.stageViews) {
    const r = s.report as Record<string, unknown> | null;
    if (!r || "skipped" in r) continue;
    const lists = [r.issues, r.alerts, r.flags, r.checks].filter(Array.isArray) as { severity?: string }[][];
    for (const l of lists) n += l.filter((x) => x.severity === "high").length;
    const f = r.findings as { bySeverity?: { high?: number } } | undefined;
    if (f?.bySeverity?.high) n += f.bySeverity.high;
  }
  return n;
}
