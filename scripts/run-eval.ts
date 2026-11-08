import "./env";
import fs from "node:fs";
import path from "node:path";
import { openDb } from "@/lib/db/client";
import { formatReport, runEval } from "@/lib/eval/run";
import { parseManifest } from "@/lib/eval/score";
import { ModelGateway } from "@/lib/llm/gateway";
import { ModelConfigError } from "@/lib/llm/types";

const read = (p: string) => ({ name: path.basename(p), text: fs.readFileSync(p, "utf8") });

async function main() {
  // A separate database, so eval runs never mix with the working story bible.
  // The model response cache lives in it too, so re-runs are free.
  const db = openDb(process.env.EVAL_DATABASE_PATH ?? "data/eval/eval.db");

  let gateway: ModelGateway | undefined;
  if (!process.argv.includes("--no-models")) {
    gateway = ModelGateway.fromEnv();
    try {
      for (const spec of gateway.specs("extract")) gateway.adapter(spec);
    } catch (err) {
      if (!(err instanceof ModelConfigError)) throw err;
      console.warn(`! models unavailable (${err.message}); scoring deterministic extraction only`);
      gateway = undefined;
    }
  }

  const report = await runEval(db, gateway, {
    clean: read("data/script.fountain"),
    seeded: read("data/eval/script.seeded.fountain"),
    costumes: read("data/costumes.csv"),
    locations: read("data/locations.csv"),
    manifest: parseManifest(fs.readFileSync("data/eval/seeded_errors.yaml", "utf8")),
  });

  fs.writeFileSync("data/eval/last_run.json", JSON.stringify(report, null, 2));
  console.log(formatReport(report));
  console.log("\nwritten to data/eval/last_run.json");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
