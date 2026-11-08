import "./env";
import { desc, eq } from "drizzle-orm";
import { runChecks } from "@/lib/checks/run";
import { openDb } from "@/lib/db/client";
import { documents, findings } from "@/lib/db/schema";

const db = openDb();
const name = process.argv[2] ?? "script.fountain";
const doc = db.select().from(documents).where(eq(documents.name, name)).orderBy(desc(documents.version)).limit(1).get();
if (!doc) {
  console.error(`no ingested script named ${name}; run npm run ingest first`);
  process.exit(1);
}
const summary = runChecks(db, doc.id);
console.log(`${name} v${doc.version}: ${summary.total} findings (${summary.open} open, ${summary.dismissed} dismissed, ${summary.followUp} follow-up)`);
for (const [check, n] of Object.entries(summary.byCheck)) console.log(`  ${check}: ${n}`);
for (const f of summary.failedChecks) console.log(`  ! ${f.id} failed: ${f.error}`);
for (const f of db.select().from(findings).where(eq(findings.docId, doc.id)).all()) {
  console.log(`\n[${f.severity}] ${f.title}\n  ${f.explanation}`);
}
