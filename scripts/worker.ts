/**
 * Run the project-agent queue locally (production uses Vercel Cron instead):
 * every few seconds, run one agent turn on each queued project.
 *
 *   npm run worker            # keep running
 *   npm run worker -- --once  # one tick, then exit
 */
import "./env";
import { runQueue } from "../src/lib/agent/queue";
import { judgeSettingsFromEnv } from "../src/lib/checks/judge";
import { getDb } from "../src/lib/db/client";
import { availableGateway } from "../src/lib/llm/available";

const once = process.argv.includes("--once");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const db = await getDb();
  const agent = availableGateway(["agent"]);
  if (!agent.gateway) console.log(`No agent model (${agent.reason}); queued projects run on the scripted agent.`);
  for (;;) {
    const tick = await runQueue(db, {
      agentGateway: agent.gateway,
      stageGateway: availableGateway(["extract", "judge"]).gateway,
      judgeSettings: judgeSettingsFromEnv(),
      concurrency: Number(process.env.AGENT_WORKER_CONCURRENCY ?? 3),
    });
    for (const r of tick.ran) console.log(`project ${r.runId}: ${r.state}${r.error ? ` (${r.error})` : ""}`);
    if (once) return;
    await sleep(tick.ran.length ? 1000 : 5000);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
