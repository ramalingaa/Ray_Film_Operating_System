import "./env";
import fs from "node:fs";
import path from "node:path";
import { Ledger, type AgentContext } from "@/lib/agents/runtime";
import { openDb } from "@/lib/db/client";
import { ModelGateway } from "@/lib/llm/gateway";
import { ModelConfigError } from "@/lib/llm/types";
import { ingest } from "@/lib/pipeline/ingest";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const read = (p: string) => ({ name: path.basename(p), text: fs.readFileSync(p, "utf8") });

async function main() {
  const db = openDb();
  const ledger = new Ledger(db);
  let gateway: ModelGateway | undefined;
  if (!process.argv.includes("--no-models")) {
    gateway = ModelGateway.fromEnv();
    try {
      for (const spec of gateway.specs("extract")) gateway.adapter(spec);
    } catch (err) {
      if (!(err instanceof ModelConfigError)) throw err;
      console.warn(`! models unavailable (${err.message}); running deterministic extraction only`);
      gateway = undefined;
    }
  }
  const ctx: AgentContext = { db, ledger, gateway };

  const costumes = arg("costumes", "data/costumes.csv");
  const locations = arg("locations", "data/locations.csv");
  const report = await ingest(ctx, {
    script: read(arg("script", "data/script.fountain")),
    costumes: fs.existsSync(costumes) ? read(costumes) : undefined,
    locations: fs.existsSync(locations) ? read(locations) : undefined,
  });

  console.log(
    [
      `script doc #${report.scriptDocId} (v${report.scriptVersion}): ${report.sceneCount} scenes, ${report.factCount} facts`,
      `model extraction: ${report.extractedScenes} scenes (${report.cachedScenes} from cache), ${report.skippedScenes} skipped, ${report.droppedItems} unverifiable items dropped`,
      gateway ? `models: ${gateway.specs("extract").join(", ")}` : "models: none (deterministic only)",
    ].join("\n"),
  );
  if (report.skippedScenes > 0 || report.droppedItems > 0) console.log("see pipeline_issues for details");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
