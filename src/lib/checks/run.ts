import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { AgentContext } from "../agents/runtime";
import type { Db } from "../db/client";
import { dismissals, findings } from "../db/schema";
import { CHECKS } from "./index";
import { judge, type JudgeSettings } from "./judge";
import { loadState } from "./state";
import type { Check, FindingDraft } from "./types";

export function findingSignature(d: Pick<FindingDraft, "checkId" | "signatureParts">): string {
  return crypto.createHash("sha256").update([d.checkId, ...d.signatureParts].join("\u0000")).digest("hex").slice(0, 24);
}

export interface RunChecksOptions {
  checks?: Check[];
  /** Needed for judged checks. Without it, only their deterministic parts run. */
  judgeCtx?: AgentContext;
  judgeSettings?: JudgeSettings;
}

export interface CheckRunSummary {
  total: number;
  open: number;
  dismissed: number;
  followUp: number;
  byCheck: Record<string, number>;
  failedChecks: { id: string; error: string }[];
  judge: { candidates: number; accepted: number; rejected: number; unjudged: number; skipped: boolean };
}

/**
 * Run every check against one script version and replace its findings.
 * Dismissals (by signature) and follow-up flags survive re-runs.
 */
export async function runChecks(db: Db, docId: number, opts: RunChecksOptions = {}): Promise<CheckRunSummary> {
  const checks = opts.checks ?? CHECKS;
  const state = loadState(db, docId);
  const drafts: FindingDraft[] = [];
  const failedChecks: CheckRunSummary["failedChecks"] = [];
  const judgeStats = { candidates: 0, accepted: 0, rejected: 0, unjudged: 0, skipped: false };
  const canJudge = !!opts.judgeCtx?.gateway && !!opts.judgeSettings;

  for (const check of checks) {
    try {
      if (check.kind === "deterministic") {
        drafts.push(...check.run(state));
        continue;
      }
      drafts.push(...(check.deterministic?.(state) ?? []));
      const candidates = check.candidates(state);
      judgeStats.candidates += candidates.length;
      if (!canJudge) {
        judgeStats.unjudged += candidates.length;
        judgeStats.skipped ||= candidates.length > 0;
        continue;
      }
      for (const c of candidates) {
        const d = await judge(opts.judgeCtx!, check, c, opts.judgeSettings!);
        if (!d) {
          judgeStats.unjudged++;
          continue;
        }
        if (!d.accepted) {
          judgeStats.rejected++;
          continue;
        }
        judgeStats.accepted++;
        const models = d.votes.map((v) => v.model).join(", ");
        drafts.push({ ...c, explanation: `${c.explanation} Judged a conflict by ${models} (confidence ${d.confidence.toFixed(2)}): ${d.reason}` });
      }
    } catch (err) {
      failedChecks.push({ id: check.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (judgeStats.skipped && opts.judgeCtx) {
    opts.judgeCtx.ledger.issue("checks", "warning", `doc ${docId}`, `${judgeStats.unjudged} candidate conflicts were not judged: no judge model configured`);
  }

  const dismissed = new Set(db.select({ s: dismissals.findingSignature }).from(dismissals).all().map((r) => r.s));
  const previous = new Map(db.select({ s: findings.signature, status: findings.status }).from(findings).where(eq(findings.docId, docId)).all().map((r) => [r.s, r.status]));

  const seen = new Set<string>();
  const rows = drafts.flatMap((d) => {
    const signature = findingSignature(d);
    if (seen.has(signature)) return [];
    seen.add(signature);
    const status = dismissed.has(signature) ? "dismissed_intentional" : previous.get(signature) === "follow_up" ? "follow_up" : "open";
    return [
      {
        docId,
        checkId: d.checkId,
        severity: d.severity,
        title: d.title,
        explanation: d.explanation,
        factIdsJson: JSON.stringify(d.factIds),
        sceneNumbersJson: JSON.stringify(d.sceneNumbers),
        signature,
        status,
      } as const,
    ];
  });

  db.transaction((tx) => {
    tx.delete(findings).where(eq(findings.docId, docId)).run();
    for (const r of rows) tx.insert(findings).values(r).run();
  });

  const byCheck: Record<string, number> = {};
  for (const r of rows) byCheck[r.checkId] = (byCheck[r.checkId] ?? 0) + 1;
  return {
    total: rows.length,
    open: rows.filter((r) => r.status === "open").length,
    dismissed: rows.filter((r) => r.status === "dismissed_intentional").length,
    followUp: rows.filter((r) => r.status === "follow_up").length,
    byCheck,
    failedChecks,
    judge: judgeStats,
  };
}
