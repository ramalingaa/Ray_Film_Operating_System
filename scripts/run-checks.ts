import "./env";
import { desc, eq } from "drizzle-orm";
import { Ledger } from "@/lib/agents/runtime";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { runChecks } from "@/lib/checks/run";
import { openDb } from "@/lib/db/client";
import { documents, findings } from "@/lib/db/schema";
import { gatewayFor } from "./models";

async function main() {
  const db = await openDb(undefined, { migrate: true });
  const name = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "script.fountain";
  const [doc] = await db.select().from(documents).where(eq(documents.name, name)).orderBy(desc(documents.version)).limit(1);
  if (!doc) throw new Error(`no ingested script named ${name}; run npm run ingest first`);

  const gateway = gatewayFor(["judge"]);
  const summary = await runChecks(db, doc.id, { judgeCtx: { db, ledger: new Ledger(db), gateway }, judgeSettings: judgeSettingsFromEnv() });

  console.log(`${name} v${doc.version}: ${summary.total} findings (${summary.open} open, ${summary.dismissed} dismissed, ${summary.followUp} follow-up)`);
  const j = summary.judge;
  console.log(`judge: ${j.candidates} candidates, ${j.accepted} accepted, ${j.rejected} rejected, ${j.unjudged} not judged`);
  for (const [check, n] of Object.entries(summary.byCheck)) console.log(`  ${check}: ${n}`);
  for (const f of summary.failedChecks) console.log(`  ! ${f.id} failed: ${f.error}`);
  for (const f of await db.select().from(findings).where(eq(findings.docId, doc.id)).orderBy(findings.id)) {
    console.log(`\n[${f.severity}] ${f.title}\n  ${f.explanation}`);
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
