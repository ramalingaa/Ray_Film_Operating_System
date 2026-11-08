import "./env";
import fs from "node:fs";
import { desc, eq } from "drizzle-orm";
import { Ledger } from "@/lib/agents/runtime";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { openDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { applyScriptEdit } from "@/lib/impact/apply";
import { computeImpact, type ImpactReport } from "@/lib/impact/impact";
import { gatewayFor } from "./models";

/**
 * npm run impact -- --script edited.fountain [--base script.fountain]
 * npm run impact -- --from 1 --to 2          (compare two stored versions)
 */
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function print(r: ImpactReport) {
  console.log(`${r.from.name}: version ${r.from.version} → ${r.to.version}\n`);
  console.log(r.summary);
  if (r.facts.added.length || r.facts.removed.length) {
    console.log(`\nFacts: +${r.facts.added.length} / -${r.facts.removed.length}`);
    for (const f of r.facts.removed) console.log(`  - scene ${f.sceneNumber} ${f.kind} ${f.subject} ${f.predicate} "${f.value}"`);
    for (const f of r.facts.added) console.log(`  + scene ${f.sceneNumber} ${f.kind} ${f.subject} ${f.predicate} "${f.value}" (line ${f.line})`);
  }
  for (const f of r.findings.added) console.log(`\nNEW [${f.severity}] ${f.title}`);
  for (const f of r.findings.resolved) console.log(`\nRESOLVED [${f.severity}] ${f.title}`);
}

async function main() {
  const db = await openDb(undefined, { migrate: true });
  const from = arg("from");
  const to = arg("to");
  if (from && to) return print(await computeImpact(db, Number(from), Number(to)));

  const script = arg("script");
  if (!script) throw new Error("usage: npm run impact -- --script edited.fountain [--base script.fountain]  |  --from <docId> --to <docId>");
  const baseName = arg("base") ?? "script.fountain";
  const [base] = await db.select().from(documents).where(eq(documents.name, baseName)).orderBy(desc(documents.version)).limit(1);
  if (!base) throw new Error(`no ingested script named ${baseName}; run npm run ingest first`);

  const gateway = gatewayFor(["extract", "judge"]);
  const r = await applyScriptEdit({ db, ledger: new Ledger(db), gateway }, base.id, fs.readFileSync(script, "utf8"), judgeSettingsFromEnv());
  print(r);
  console.log(`\nmodel extraction: ${r.modelCalls.extractedScenes} scene(s) re-extracted, ${r.modelCalls.cachedScenes} from cache`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
