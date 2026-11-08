import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { dismissals, findings } from "../db/schema";
import { CHECKS } from "./index";
import { loadState } from "./state";
import type { Check, FindingDraft } from "./types";

export function findingSignature(d: Pick<FindingDraft, "checkId" | "signatureParts">): string {
  return crypto.createHash("sha256").update([d.checkId, ...d.signatureParts].join("\u0000")).digest("hex").slice(0, 24);
}

export interface CheckRunSummary {
  total: number;
  open: number;
  dismissed: number;
  followUp: number;
  byCheck: Record<string, number>;
  failedChecks: { id: string; error: string }[];
}

/**
 * Run every check against one script version and replace its findings.
 * Dismissals (by signature) and follow-up flags survive re-runs.
 */
export function runChecks(db: Db, docId: number, checks: Check[] = CHECKS): CheckRunSummary {
  const state = loadState(db, docId);
  const drafts: FindingDraft[] = [];
  const failedChecks: CheckRunSummary["failedChecks"] = [];
  for (const check of checks) {
    try {
      drafts.push(...check.run(state));
    } catch (err) {
      failedChecks.push({ id: check.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const dismissed = new Set(db.select({ s: dismissals.findingSignature }).from(dismissals).all().map((r) => r.s));
  const previous = new Map(db.select({ s: findings.signature, status: findings.status }).from(findings).where(eq(findings.docId, docId)).all().map((r) => [r.s, r.status]));

  const seen = new Set<string>();
  const rows = drafts.flatMap((d) => {
    const signature = findingSignature(d);
    if (seen.has(signature)) return [];
    seen.add(signature);
    const status = dismissed.has(signature) ? "dismissed_intentional" : previous.get(signature) === "follow_up" ? "follow_up" : "open";
    return [{
      docId,
      checkId: d.checkId,
      severity: d.severity,
      title: d.title,
      explanation: d.explanation,
      factIdsJson: JSON.stringify(d.factIds),
      sceneNumbersJson: JSON.stringify(d.sceneNumbers),
      signature,
      status,
    } as const];
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
  };
}
