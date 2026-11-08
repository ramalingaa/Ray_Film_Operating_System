import { eq } from "drizzle-orm";
import { Ledger } from "../agents/runtime";
import { CHECKS } from "../checks/index";
import { runChecks } from "../checks/run";
import type { JudgeSettings } from "../checks/judge";
import type { Check } from "../checks/types";
import type { Db } from "../db/client";
import { findings, pipelineIssues } from "../db/schema";
import type { ModelGateway } from "../llm/gateway";
import { ingest, type SourceFile } from "../pipeline/ingest";
import { score, type ScoredFinding, type ScoreResult, type SeededError } from "./score";

export interface EvalInput {
  clean: SourceFile;
  seeded: SourceFile;
  costumes: SourceFile;
  locations: SourceFile;
  manifest: SeededError[];
}

export interface EvalReport {
  ranAt: string;
  models: string[];
  checks: string[];
  seeded: ScoreResult;
  clean: { falseAlarms: number; findings: ScoredFinding[] };
  pipeline: { skippedScenes: number; droppedItems: number; issues: number };
  judge: { models: string[]; policy: string; threshold: number; candidates: number; accepted: number; rejected: number; unjudged: number };
}

function findingsFor(db: Db, docId: number): ScoredFinding[] {
  return db
    .select()
    .from(findings)
    .where(eq(findings.docId, docId))
    .all()
    .map((f) => ({ checkId: f.checkId, sceneNumbers: JSON.parse(f.sceneNumbersJson) as string[], title: f.title }));
}

/** Ingest the clean and seeded scripts, run every check, and score the seeded findings. */
export async function runEval(
  db: Db,
  gateway: ModelGateway | undefined,
  input: EvalInput,
  judgeSettings: JudgeSettings = { policy: "primary", threshold: 0.7 },
  checks: Check[] = CHECKS,
): Promise<EvalReport> {
  const ledger = new Ledger(db);
  const issuesBefore = db.select({ id: pipelineIssues.id }).from(pipelineIssues).all().length;
  const ctx = { db, ledger, gateway };
  const sheets = { costumes: input.costumes, locations: input.locations };

  const clean = await ingest(ctx, { script: input.clean, ...sheets });
  const seeded = await ingest(ctx, { script: input.seeded, ...sheets });
  const judged = { checks, judgeCtx: ctx, judgeSettings };
  const cleanRun = await runChecks(db, clean.scriptDocId, judged);
  const seededRun = await runChecks(db, seeded.scriptDocId, judged);

  const cleanFindings = findingsFor(db, clean.scriptDocId);
  return {
    ranAt: new Date().toISOString(),
    models: gateway ? gateway.specs("extract") : [],
    checks: checks.map((c) => c.id),
    seeded: score(findingsFor(db, seeded.scriptDocId), input.manifest, checks.map((c) => c.id)),
    clean: { falseAlarms: cleanFindings.length, findings: cleanFindings },
    judge: {
      models: gateway ? gateway.specs("judge") : [],
      policy: judgeSettings.policy,
      threshold: judgeSettings.threshold,
      candidates: cleanRun.judge.candidates + seededRun.judge.candidates,
      accepted: cleanRun.judge.accepted + seededRun.judge.accepted,
      rejected: cleanRun.judge.rejected + seededRun.judge.rejected,
      unjudged: cleanRun.judge.unjudged + seededRun.judge.unjudged,
    },
    pipeline: {
      skippedScenes: clean.skippedScenes + seeded.skippedScenes,
      droppedItems: clean.droppedItems + seeded.droppedItems,
      issues: db.select({ id: pipelineIssues.id }).from(pipelineIssues).all().length - issuesBefore,
    },
  };
}

const pct = (x: number | null) => (x == null ? "  n/a" : `${(x * 100).toFixed(0).padStart(4)}%`);

export function formatReport(r: EvalReport): string {
  const s = r.seeded;
  const lines = [
    `Eval ${r.ranAt}`,
    `models: ${r.models.length ? r.models.join(", ") : "none (deterministic extraction only)"}`,
    `judge: ${r.judge.models.length ? `${r.judge.models.join(", ")} (${r.judge.policy}, threshold ${r.judge.threshold})` : "none"} — ${r.judge.candidates} candidates, ${r.judge.accepted} accepted, ${r.judge.rejected} rejected, ${r.judge.unjudged} not judged`,
    "",
    `Seeded script: precision ${pct(s.precision)}  recall ${pct(s.recall)}  (tp ${s.tp}, fp ${s.fp}, fn ${s.fn})`,
    `Clean script false alarms: ${r.clean.falseAlarms}`,
    "",
    "check                        precision  recall   tp  fp  fn",
    ...Object.entries(s.perCheck).map(
      ([id, c]) => `${id.padEnd(28)} ${pct(c.precision)}    ${pct(c.recall)}  ${String(c.tp).padStart(3)} ${String(c.fp).padStart(3)} ${String(c.fn).padStart(3)}`,
    ),
  ];
  if (s.outOfScope.length) {
    const pending = [...new Set(s.outOfScope.map((e) => e.check_id))];
    lines.push("", `not scored yet (check not implemented): ${pending.join(", ")} — ${s.outOfScope.length} planted errors`);
  }
  if (s.missed.length) lines.push("", "Missed:", ...s.missed.map((e) => `  ${e.id} ${e.check_id} [${e.scenes.join(",")}] ${e.description}`));
  if (s.falseAlarms.length) lines.push("", "False alarms (seeded):", ...s.falseAlarms.map((f) => `  ${f.checkId} [${f.sceneNumbers.join(",")}] ${f.title}`));
  if (r.clean.findings.length) lines.push("", "False alarms (clean):", ...r.clean.findings.map((f) => `  ${f.checkId} [${f.sceneNumbers.join(",")}] ${f.title}`));
  if (r.pipeline.skippedScenes || r.pipeline.droppedItems) {
    lines.push("", `pipeline: ${r.pipeline.skippedScenes} scenes skipped, ${r.pipeline.droppedItems} unverifiable items dropped (see pipeline_issues)`);
  }
  return lines.join("\n");
}
