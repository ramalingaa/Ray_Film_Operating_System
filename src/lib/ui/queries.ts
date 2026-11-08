/** Read models for the UI. Server-only: these touch SQLite directly. */
import { desc, eq, inArray } from "drizzle-orm";
import { getCheck } from "../checks/index";
import type { Db } from "../db/client";
import { agentRuns, dismissals, documents, facts, findings, pipelineIssues, scenes } from "../db/schema";

export type Severity = "high" | "medium" | "low";
export type FindingStatus = "open" | "dismissed_intentional" | "follow_up";

export interface SourceView {
  docName: string;
  docKind: string;
  isScript: boolean;
  line: number;
  snippet: string;
  /** The full source line (sheet row or script line), for context. */
  text: string;
}

export interface FindingView {
  id: number;
  checkId: string;
  checkTitle: string;
  severity: Severity;
  title: string;
  explanation: string;
  status: FindingStatus;
  sceneNumbers: string[];
  sources: SourceView[];
  dismissReason: string | null;
}

export interface SceneView {
  number: string;
  heading: string;
  startLine: number;
  lines: string[];
  isFlashback: boolean;
}

export interface ReviewData {
  doc: { id: number; name: string; version: number; createdAt: string };
  scenes: SceneView[];
  findings: FindingView[];
  openIssues: number;
}

export async function latestScript(db: Db) {
  const [doc] = await db.select().from(documents).where(eq(documents.kind, "script")).orderBy(desc(documents.id)).limit(1);
  return doc;
}

export async function loadReview(db: Db, docId: number): Promise<ReviewData | undefined> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, docId));
  if (!doc) return undefined;

  const sceneRows = await db.select().from(scenes).where(eq(scenes.docId, docId)).orderBy(scenes.ordinal);
  const findingRows = await db.select().from(findings).where(eq(findings.docId, docId)).orderBy(findings.id);
  const factIds = [...new Set(findingRows.flatMap((f) => JSON.parse(f.factIdsJson) as number[]))];
  const factRows = factIds.length ? await db.select().from(facts).where(inArray(facts.id, factIds)) : [];
  const docIds = [...new Set(factRows.map((f) => f.sourceDocId))];
  const docs = new Map(
    (docIds.length ? await db.select().from(documents).where(inArray(documents.id, docIds)) : []).map((d) => [d.id, { ...d, lines: d.rawText.replace(/\r\n?/g, "\n").split("\n") }]),
  );
  const factById = new Map(factRows.map((f) => [f.id, f]));
  const reasons = new Map((await db.select().from(dismissals)).map((d) => [d.findingSignature, d.reason]));

  const severityRank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  const views: FindingView[] = findingRows
    .map((f) => ({
      id: f.id,
      checkId: f.checkId,
      checkTitle: getCheck(f.checkId)?.title ?? f.checkId,
      severity: f.severity,
      title: f.title,
      explanation: f.explanation,
      status: f.status,
      sceneNumbers: JSON.parse(f.sceneNumbersJson) as string[],
      dismissReason: reasons.get(f.signature) ?? null,
      sources: (JSON.parse(f.factIdsJson) as number[]).flatMap((id) => {
        const fact = factById.get(id);
        const d = fact && docs.get(fact.sourceDocId);
        if (!fact || !d) return [];
        return [{ docName: d.name, docKind: d.kind, isScript: d.id === docId, line: fact.sourceLine, snippet: fact.sourceSnippet, text: d.lines[fact.sourceLine - 1] ?? "" }];
      }),
    }))
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity] || Number(a.sceneNumbers[0]) - Number(b.sceneNumbers[0]));

  return {
    doc: { id: doc.id, name: doc.name, version: doc.version, createdAt: doc.createdAt },
    scenes: sceneRows.map((s) => ({ number: s.number, heading: s.heading, startLine: s.startLine, lines: s.text.split("\n"), isFlashback: s.isFlashback })),
    findings: views,
    openIssues: await db.$count(pipelineIssues, inArray(pipelineIssues.severity, ["error", "warning"])),
  };
}

export interface Readiness {
  doc: ReviewData["doc"];
  sceneCount: number;
  bySeverity: Record<Severity, { open: number; followUp: number; dismissed: number }>;
  byCheck: { checkId: string; title: string; open: number; followUp: number; dismissed: number }[];
  open: FindingView[];
  followUp: FindingView[];
}

export async function loadReadiness(db: Db, docId: number): Promise<Readiness | undefined> {
  const review = await loadReview(db, docId);
  if (!review) return undefined;
  const bySeverity: Readiness["bySeverity"] = {
    high: { open: 0, followUp: 0, dismissed: 0 },
    medium: { open: 0, followUp: 0, dismissed: 0 },
    low: { open: 0, followUp: 0, dismissed: 0 },
  };
  const checks = new Map<string, Readiness["byCheck"][number]>();
  for (const f of review.findings) {
    const key = f.status === "open" ? "open" : f.status === "follow_up" ? "followUp" : "dismissed";
    bySeverity[f.severity][key]++;
    const c = checks.get(f.checkId) ?? { checkId: f.checkId, title: f.checkTitle, open: 0, followUp: 0, dismissed: 0 };
    c[key]++;
    checks.set(f.checkId, c);
  }
  return {
    doc: review.doc,
    sceneCount: review.scenes.length,
    bySeverity,
    byCheck: [...checks.values()].sort((a, b) => b.open + b.followUp - (a.open + a.followUp)),
    open: review.findings.filter((f) => f.status === "open"),
    followUp: review.findings.filter((f) => f.status === "follow_up"),
  };
}

export async function loadHealth(db: Db) {
  const issues = await db.select().from(pipelineIssues).orderBy(desc(pipelineIssues.id)).limit(300);
  const runs = await db.select().from(agentRuns).orderBy(agentRuns.id);
  const byAgent = new Map<string, { ok: number; failed: number; cached: number; inputTokens: number; outputTokens: number }>();
  for (const r of runs) {
    const a = byAgent.get(r.agent) ?? { ok: 0, failed: 0, cached: 0, inputTokens: 0, outputTokens: 0 };
    if (r.status === "ok") a.ok++;
    if (r.status === "failed") a.failed++;
    if (r.cacheHit) a.cached++;
    a.inputTokens += r.inputTokens ?? 0;
    a.outputTokens += r.outputTokens ?? 0;
    byAgent.set(r.agent, a);
  }
  return { issues, agents: [...byAgent.entries()].map(([agent, s]) => ({ agent, ...s })) };
}
