/**
 * npm run produce -- --story data/short-story.txt --title "Lost and Found"
 * npm run produce -- --resume 8      (continue a production; failed steps are retried)
 *
 * Takes one story (or screenplay) through every chapter, approving each one as
 * soon as it is ready, and writes a performance record: time per chapter,
 * every model call (model, cache hit, tokens, failure), dropped citations and
 * pipeline issues. The production is stored in the configured database, so it
 * also appears in the app.
 */
import "./env";
import fs from "node:fs";
import path from "node:path";
import { asc, desc, eq, gt } from "drizzle-orm";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { openDb } from "@/lib/db/client";
import { agentRuns, pipelineIssues, runs, runStages } from "@/lib/db/schema";
import { approveChapter, createRun, retryRun, runToEnd, writeScriptFromStory, type StepOptions } from "@/lib/pipeline/runs";
import { CHAPTERS } from "@/lib/stages/chapters";
import { gatewayFor } from "./models";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg("story") ?? "data/short-story.txt";
  const db = await openDb(undefined, { migrate: true });
  const gateway = gatewayFor(["extract", "judge"]);
  const opts: StepOptions = { gateway, judgeSettings: judgeSettingsFromEnv() };

  // Everything logged after these ids belongs to this production.
  const [lastRun] = await db.select({ id: agentRuns.id }).from(agentRuns).orderBy(desc(agentRuns.id)).limit(1);
  const [lastIssue] = await db.select({ id: pipelineIssues.id }).from(pipelineIssues).orderBy(desc(pipelineIssues.id)).limit(1);
  const maxRun = lastRun?.id ?? 0;
  const issuesFrom = lastIssue?.id ?? 0;

  const started = Date.now();
  const resume = arg("resume");
  let id: number;
  if (resume) {
    id = Number(resume);
    await retryRun(db, id);
    console.log(`production #${id} resumed (failed steps retried)`);
  } else {
    id = await createRun(db, { title: arg("title"), sourceName: path.basename(file), text: fs.readFileSync(file, "utf8") });
    console.log(`production #${id} created from ${file}`);
  }

  const chapters: { chapter: string; seconds: number; outcome: string; stages: { stage: string; status: string; error: string | null; seconds: number | null }[] }[] = [];
  for (let i = 0; i < 40; i++) {
    const [run] = await db.select().from(runs).where(eq(runs.id, id));
    const index = Math.min(run.approvedThrough + 1, CHAPTERS.length - 1);
    const t0 = Date.now();
    let o = await runToEnd(db, id, opts);
    if (o.state === "awaiting") {
      console.log("  chapter II asks how the screenplay is made: writing it from the story");
      await writeScriptFromStory(db, id);
      o = await runToEnd(db, id, opts);
    }
    const rows = await db.select().from(runStages).where(eq(runStages.runId, id));
    const ch = CHAPTERS[index];
    const stages = ch.stages.map((st) => {
      const r = rows.find((x) => x.stage === st)!;
      const secs = r.startedAt && r.finishedAt ? (Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000 : null;
      return { stage: st, status: r.status, error: r.error, seconds: secs };
    });
    const seconds = (Date.now() - t0) / 1000;
    chapters.push({ chapter: ch.title, seconds, outcome: o.state, stages });
    console.log(`  ${ch.numeral}. ${ch.title}: ${o.state} in ${seconds.toFixed(1)}s`);
    if (o.state === "failed" || o.state === "busy") break;
    if (o.state === "done") break;
    if (o.state === "review") await approveChapter(db, id, run.approvedThrough + 1);
  }

  const calls = await db.select().from(agentRuns).where(gt(agentRuns.id, maxRun)).orderBy(asc(agentRuns.id));
  const issues = await db.select().from(pipelineIssues).where(gt(pipelineIssues.id, issuesFrom)).orderBy(asc(pipelineIssues.id));
  const [run] = await db.select().from(runs).where(eq(runs.id, id));
  const stageRows = await db.select().from(runStages).where(eq(runStages.runId, id));

  const byAgent: Record<string, { runs: number; ok: number; failed: number; cached: number; inputTokens: number; outputTokens: number; models: Record<string, number> }> = {};
  for (const c of calls) {
    const a = (byAgent[c.agent.split("@")[0]] ??= { runs: 0, ok: 0, failed: 0, cached: 0, inputTokens: 0, outputTokens: 0, models: {} });
    a.runs++;
    if (c.status === "ok") a.ok++;
    if (c.status === "failed") a.failed++;
    if (c.cacheHit) a.cached++;
    a.inputTokens += c.inputTokens ?? 0;
    a.outputTokens += c.outputTokens ?? 0;
    if (c.model) for (const m of c.model.split("+")) a.models[m] = (a.models[m] ?? 0) + 1;
  }

  const record = {
    productionId: id,
    title: run.title,
    source: file,
    finishedAt: new Date().toISOString(),
    totalSeconds: (Date.now() - started) / 1000,
    greenlit: run.approvedThrough >= CHAPTERS.length - 1,
    models: { extract: gateway?.specs("extract") ?? [], judge: gateway?.specs("judge") ?? [] },
    chapters,
    agents: byAgent,
    issues: issues.map((i) => ({ stage: i.stage, severity: i.severity, ref: i.ref, message: i.message })),
    // Reports only (citations are short quotes); never the script or story text itself.
    reports: Object.fromEntries(stageRows.map((r) => [r.stage, r.reportJson ? JSON.parse(r.reportJson) : null])),
  };
  fs.mkdirSync("data/runs", { recursive: true });
  const out = `data/runs/production-${id}.json`;
  fs.writeFileSync(out, JSON.stringify(record, null, 2));
  console.log(`\n${record.greenlit ? "greenlit" : "stopped"} after ${record.totalSeconds.toFixed(0)}s · ${calls.length} agent runs · ${issues.length} pipeline issues\nwritten to ${out}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
