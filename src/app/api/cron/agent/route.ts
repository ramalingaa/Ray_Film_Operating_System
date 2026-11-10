/**
 * The background worker for project agents, called by Vercel Cron every
 * minute (see vercel.json). Each call runs one agent turn on each queued
 * project, a few at a time, and returns what it did.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. In production the
 * route refuses to run without CRON_SECRET set, so nobody else can trigger
 * model calls on your keys.
 */
import { connection } from "next/server";
import { cronAuthorized, runQueue } from "@/lib/agent/queue";
import { judgeSettingsFromEnv } from "@/lib/checks/judge";
import { databaseProblem, getDb } from "@/lib/db/client";
import { availableGateway } from "@/lib/llm/available";

/** One agent turn takes up to about 200 s; this leaves room to save its work. */
export const maxDuration = 300;

export async function GET(request: Request) {
  await connection();
  const auth = cronAuthorized(request.headers.get("authorization"));
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
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
