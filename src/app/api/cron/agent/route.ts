/**
 * The background worker for project agents. Each call runs one agent turn
 * on each queued project, a few at a time, and returns what it did.
 *
 * Sleeping by default: it does nothing until AGENT_WORKER_ENABLED=1, and no
 * schedule calls it yet. To activate, set the variable and add a schedule
 * (a Vercel cron on Pro, or any scheduler that sends the secret).
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. In production the
 * route refuses to run without CRON_SECRET set, so nobody else can trigger
 * model calls on your keys.
 */
import { connection } from "next/server";
import { cronAuthorized, runQueue, workerEnabled } from "@/lib/agent/queue";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { databaseProblem, getDb } from "@/lib/db/client";
import { availableGateway } from "@/lib/llm/available";

/** One agent turn takes up to about 200 s; this leaves room to save its work. */
export const maxDuration = 300;

export async function GET(request: Request) {
  await connection();
  const auth = cronAuthorized(request.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
  if (!workerEnabled()) return Response.json({ sleeping: true, hint: "Set AGENT_WORKER_ENABLED=1 to activate the background worker." });
  const problem = databaseProblem();
  if (problem) return Response.json({ error: problem }, { status: 500 });

  const tick = await runQueue(await getDb(), {
    agentGateway: availableGateway(["agent"]).gateway,
    stageGateway: availableGateway(["extract", "judge"]).gateway,
    judgeSettings: judgeSettingsFromEnv(),
    budgetMs: 200_000,
    concurrency: Number(process.env.AGENT_WORKER_CONCURRENCY ?? 3),
  });
  return Response.json(tick);
}
