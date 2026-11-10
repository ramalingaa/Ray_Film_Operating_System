/**
 * Background work for project agents: a queue in Postgres.
 *
 * The queue is the `runs` table itself. A project whose agent status is
 * "running" has a job waiting; its `agent_locked_until` lease says whether a
 * turn is already working on it. A worker (the Vercel Cron route, or
 * `npm run worker` locally) claims projects whose lease is free and runs one
 * turn on each. A turn that crashes leaves its lease to expire, and the next
 * tick picks the project up again, so no job is lost.
 *
 * The workspace page still runs turns while it is open; the shared lease
 * means a page and the worker never work on the same project at once.
 */
import { and, asc, eq, isNull, lt, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { runs } from "../db/schema";
import { agentTurn, type AgentTurnOptions, type AgentTurnOutcome } from "./loop";

/** Projects with work waiting and no turn in progress, oldest update first. */
export async function queuedProjects(db: Db, limit: number, at = Date.now()): Promise<number[]> {
  const rows = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.agentStatus, "running"), or(isNull(runs.agentLockedUntil), lt(runs.agentLockedUntil, at))))
    .orderBy(asc(runs.updatedAt), asc(runs.id))
    .limit(limit);
  return rows.map((r) => r.id);
}

export interface QueueTick {
  ran: { runId: number; state: AgentTurnOutcome["state"]; error?: string }[];
  /** Projects still waiting after this tick (left for the next one). */
  waiting: number;
}

export interface QueueOptions extends AgentTurnOptions {
  /** Projects worked on at the same time. Keep under the database pool size. */
  concurrency?: number;
  /** Most projects one tick takes on. */
  maxProjects?: number;
}

/**
 * One worker tick: claim up to `maxProjects` queued projects and run one
 * agent turn on each, `concurrency` at a time. A turn's own errors are
 * recorded on its project by `agentTurn`; anything that escapes is reported
 * here and the project stays queued for the next tick.
 */
export async function runQueue(db: Db, opts: QueueOptions): Promise<QueueTick> {
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const ids = await queuedProjects(db, Math.max(concurrency, opts.maxProjects ?? concurrency));
  const ran: QueueTick["ran"] = [];
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const runId = ids[next++];
      try {
        const o = await agentTurn(db, runId, opts);
        ran.push({ runId, state: o.state });
      } catch (err) {
        ran.push({ runId, state: "failed", error: err instanceof Error ? err.message : String(err) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  return { ran, waiting: (await queuedProjects(db, 1000)).length };
}

/** Whether a cron call may run the queue: it must carry `Bearer $CRON_SECRET`, and production requires the secret to be set. */
export function cronAuthorized(authHeader: string | null, env: Record<string, string | undefined> = process.env): { ok: true } | { ok: false; status: number; error: string } {
  const secret = env.CRON_SECRET?.trim();
  if (!secret) {
    return env.NODE_ENV === "production" ? { ok: false, status: 500, error: "CRON_SECRET is not set for this deployment." } : { ok: true };
  }
  return authHeader === `Bearer ${secret}` ? { ok: true } : { ok: false, status: 401, error: "Unauthorized." };
}

/** The background worker sleeps until AGENT_WORKER_ENABLED is set to 1 (or true). */
export function workerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(env.AGENT_WORKER_ENABLED?.trim() ?? "");
}
