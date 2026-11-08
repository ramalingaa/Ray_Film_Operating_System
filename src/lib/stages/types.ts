import type { AgentContext } from "../agents/runtime";
import type { JudgeSettings } from "../checks/judge";
import type { RunStage, runs } from "../db/schema";

export type RunRow = typeof runs.$inferSelect;

export interface StageEnv {
  ctx: AgentContext;
  run: RunRow;
  judgeSettings: JudgeSettings;
  /** Epoch ms. Stages that call models stop starting new calls after this and report progress instead. */
  deadline: number;
}

export interface StepResult<R> {
  /** False when the stage made progress but has more to do (call it again). */
  done: boolean;
  progress?: string;
  /** Set (with done = false) when the stage cannot continue without the user, e.g. a choice to make. */
  awaiting?: string;
  report?: R;
  /** Fields to save on the run (e.g. the script text produced by intake). */
  runPatch?: Partial<Pick<RunRow, "scriptText" | "scriptGenerated" | "scriptDocId" | "title">>;
}

export interface StageDef<R = unknown> {
  id: RunStage;
  title: string;
  /** One line shown before the stage has run. */
  summary: string;
  step(env: StageEnv): Promise<StepResult<R>>;
}

/** A citation every stage report uses: where in which document a statement comes from. */
export interface Cite {
  docName: string;
  line: number;
  snippet: string;
  sceneNumber?: string;
}

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "untitled"
  );
}

/** The document name a run's script is stored under. Same title → versions of the same script. */
export function scriptDocName(run: Pick<RunRow, "title">): string {
  return `${slug(run.title)}.fountain`;
}
