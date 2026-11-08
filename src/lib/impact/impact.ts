/**
 * Change impact between two versions of a script that are both in the story
 * graph: which scenes changed, which facts appeared or disappeared, what in
 * the graph depends on those facts, and which findings are new or resolved.
 */
import { eq } from "drizzle-orm";
import { loadState } from "../checks/state";
import type { BibleState, FactInfo, SceneInfo } from "../checks/types";
import type { Db } from "../db/client";
import { documents, findings, scenes } from "../db/schema";

export interface DocRef {
  id: number;
  name: string;
  version: number;
}

export interface SceneChange {
  number: string;
  heading: string;
  kind: "changed" | "added" | "removed";
}

export interface FactChange {
  kind: string;
  subject: string;
  predicate: string;
  value: string;
  sceneNumber: string | null;
  line: number;
  snippet: string;
}

export interface Touch {
  kind: "day_shift" | "later_scene" | "costume_row" | "location_row" | "same_location";
  label: string;
  because: string;
  sceneNumber?: string;
  source: { docName: string; line: number; snippet: string };
}

export interface FindingRef {
  checkId: string;
  severity: string;
  title: string;
  sceneNumbers: string[];
}

export interface ImpactReport {
  from: DocRef;
  to: DocRef;
  scenes: SceneChange[];
  facts: { added: FactChange[]; removed: FactChange[] };
  touches: Touch[];
  findings: { added: FindingRef[]; resolved: FindingRef[]; unchanged: number };
  summary: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Scene facts only (sheet rows are shared between versions and never "change" here). */
function sceneFacts(state: BibleState): Map<string, { fact: FactInfo; scene: SceneInfo }> {
  const byId = new Map(state.scenes.map((s) => [s.id, s]));
  const out = new Map<string, { fact: FactInfo; scene: SceneInfo }>();
  for (const f of state.facts) {
    if (f.sceneId == null || f.sourceDocId !== state.docId || f.kind === "story_day") continue;
    const scene = byId.get(f.sceneId)!;
    const subject = f.subjectEntityId == null ? "" : (state.entityNames.get(f.subjectEntityId) ?? "");
    const key = [f.kind, subject, f.predicate, norm(f.objectValue), scene.number].join("\u0000");
    if (!out.has(key)) out.set(key, { fact: f, scene });
  }
  return out;
}

function toChange(state: BibleState, { fact, scene }: { fact: FactInfo; scene: SceneInfo }): FactChange {
  return {
    kind: fact.kind,
    subject: fact.subjectEntityId == null ? "" : (state.entityNames.get(fact.subjectEntityId) ?? ""),
    predicate: fact.predicate,
    value: fact.objectValue,
    sceneNumber: scene.number,
    line: fact.sourceLine,
    snippet: fact.sourceSnippet,
  };
}

function findingRefs(db: Db, docId: number): Map<string, FindingRef> {
  return new Map(
    db
      .select()
      .from(findings)
      .where(eq(findings.docId, docId))
      .all()
      .map((f) => [f.signature, { checkId: f.checkId, severity: f.severity, title: f.title, sceneNumbers: JSON.parse(f.sceneNumbersJson) as string[] }]),
  );
}

function docRef(db: Db, id: number): DocRef {
  const d = db.select().from(documents).where(eq(documents.id, id)).get();
  if (!d) throw new Error(`document ${id} not found`);
  if (d.kind !== "script") throw new Error(`document ${id} is a ${d.kind}, not a script`);
  return { id: d.id, name: d.name, version: d.version };
}

export function computeImpact(db: Db, fromId: number, toId: number): ImpactReport {
  const from = docRef(db, fromId);
  const to = docRef(db, toId);

  // 1. Scenes, matched by scene number.
  const oldScenes = new Map(db.select().from(scenes).where(eq(scenes.docId, fromId)).all().map((s) => [s.number, s]));
  const newScenes = new Map(db.select().from(scenes).where(eq(scenes.docId, toId)).all().map((s) => [s.number, s]));
  const sceneChanges: SceneChange[] = [];
  for (const [n, s] of newScenes) {
    const old = oldScenes.get(n);
    if (!old) sceneChanges.push({ number: n, heading: s.heading, kind: "added" });
    else if (old.textHash !== s.textHash) sceneChanges.push({ number: n, heading: s.heading, kind: "changed" });
  }
  for (const [n, s] of oldScenes) if (!newScenes.has(n)) sceneChanges.push({ number: n, heading: s.heading, kind: "removed" });
  const ordinalOf = (n: string) => newScenes.get(n)?.ordinal ?? oldScenes.get(n)?.ordinal ?? 0;
  sceneChanges.sort((a, b) => ordinalOf(a.number) - ordinalOf(b.number));

  // 2. Facts (content only; story-day moves are reported as day shifts).
  const oldState = loadState(db, fromId);
  const newState = loadState(db, toId);
  const oldFacts = sceneFacts(oldState);
  const newFacts = sceneFacts(newState);
  const added = [...newFacts].filter(([k]) => !oldFacts.has(k)).map(([, v]) => v);
  const removed = [...oldFacts].filter(([k]) => !newFacts.has(k)).map(([, v]) => v);

  const oldDay = new Map(oldState.scenes.map((s) => [s.number, s.storyDay]));
  const dayShifts = newState.scenes
    .filter((s) => oldDay.has(s.number) && oldDay.get(s.number) !== s.storyDay)
    .map((s) => ({ scene: s, from: oldDay.get(s.number) ?? null, to: s.storyDay }));

  // 3. Walk the graph (in the new version) from every changed fact.
  const changedNumbers = new Set(sceneChanges.filter((c) => c.kind !== "removed").map((c) => c.number));
  const earliest = Math.min(...[...added, ...removed].map((x) => x.scene.ordinal), ...[...changedNumbers].map(ordinalOf), Infinity);
  const nameToNewId = new Map([...newState.entityNames].map(([id, name]) => [name, id]));
  /** Entities whose own facts changed: their later scenes and sheet rows are downstream. */
  const entityIds = new Set<number>();
  for (const x of added) if (x.fact.subjectEntityId != null) entityIds.add(x.fact.subjectEntityId);
  for (const x of removed) {
    const name = x.fact.subjectEntityId == null ? undefined : oldState.entityNames.get(x.fact.subjectEntityId);
    const id = name ? nameToNewId.get(name) : undefined;
    if (id != null) entityIds.add(id);
  }
  /** Scenes and story days the change actually reaches; sheet rows outside them are not affected. */
  const affectedScenes = new Set([...changedNumbers, ...dayShifts.map((d) => d.scene.number), ...added.map((x) => x.scene.number), ...removed.map((x) => x.scene.number)]);
  const affectedDays = new Set<number>();
  for (const n of affectedScenes) {
    for (const d of [oldDay.get(n), newScenes.has(n) ? newState.scenes.find((s) => s.number === n)?.storyDay : undefined]) if (d != null) affectedDays.add(d);
  }
  /** Everyone in a scene that moved to another day may need different costume rows. */
  const sheetEntityIds = new Set(entityIds);
  const shiftedIds = new Set(dayShifts.map((d) => d.scene.id));
  for (const f of newState.facts) if (f.sceneId != null && shiftedIds.has(f.sceneId) && f.subjectEntityId != null) sheetEntityIds.add(f.subjectEntityId);

  const touches: Touch[] = [];
  const seen = new Set<string>();
  const push = (key: string, t: Touch) => {
    if (seen.has(key)) return;
    seen.add(key);
    touches.push(t);
  };
  const sceneById = new Map(newState.scenes.map((s) => [s.id, s]));

  for (const { scene, from: d0, to: d1 } of dayShifts) {
    const fact = newState.facts.find((f) => f.sceneId === scene.id && f.kind === "story_day");
    if (!fact) continue;
    push(`day:${scene.number}`, {
      kind: "day_shift",
      label: `scene ${scene.number} moves from day ${d0 ?? "unknown"} to day ${d1 ?? "unknown"}`,
      because: "story day",
      sceneNumber: scene.number,
      source: { docName: fact.sourceDocName, line: fact.sourceLine, snippet: fact.sourceSnippet },
    });
  }

  for (const id of sheetEntityIds) {
    const name = newState.entityNames.get(id) ?? `entity ${id}`;
    for (const f of newState.facts) {
      if (f.subjectEntityId !== id || f.predicate !== "sheet_costume") continue;
      const scenesCovered = (f.attrs.scenes as string[] | undefined) ?? [];
      const reached = scenesCovered.length ? scenesCovered.some((n) => affectedScenes.has(n)) : f.storyDay != null && affectedDays.has(f.storyDay);
      if (!reached) continue;
      push(`row:${f.sourceDocId}:${f.sourceLine}`, {
        kind: "costume_row",
        label: `costume row for ${name} ${scenesCovered.length ? `(scenes ${scenesCovered.join(", ")})` : `on day ${f.storyDay}`}`,
        because: name,
        source: { docName: f.sourceDocName, line: f.sourceLine, snippet: f.sourceSnippet },
      });
    }
  }

  for (const id of entityIds) {
    const name = newState.entityNames.get(id) ?? `entity ${id}`;
    for (const f of newState.facts) {
      if (f.subjectEntityId !== id || f.predicate === "sheet_costume") continue;
      if (f.predicate === "sheet_location") {
        push(`row:${f.sourceDocId}:${f.sourceLine}`, {
          kind: "location_row",
          label: `location sheet row for ${name}`,
          because: name,
          source: { docName: f.sourceDocName, line: f.sourceLine, snippet: f.sourceSnippet },
        });
      } else if (f.sceneId != null) {
        const scene = sceneById.get(f.sceneId);
        if (!scene || scene.ordinal <= earliest || changedNumbers.has(scene.number)) continue;
        push(`scene:${scene.number}:${id}`, {
          kind: "later_scene",
          label: `scene ${scene.number} (${name})`,
          because: name,
          sceneNumber: scene.number,
          source: { docName: f.sourceDocName, line: f.sourceLine, snippet: f.sourceSnippet },
        });
      }
    }
  }

  for (const n of changedNumbers) {
    const scene = newState.scenes.find((s) => s.number === n);
    if (!scene || scene.locationEntityId == null) continue;
    const place = newState.entityNames.get(scene.locationEntityId) ?? "same location";
    for (const other of newState.scenes) {
      if (other.locationEntityId !== scene.locationEntityId || changedNumbers.has(other.number)) continue;
      const heading = newState.facts.find((f) => f.sceneId === other.id && f.predicate === "scene_location");
      if (!heading) continue;
      push(`loc:${other.number}`, {
        kind: "same_location",
        label: `scene ${other.number} (same location: ${place})`,
        because: place,
        sceneNumber: other.number,
        source: { docName: heading.sourceDocName, line: heading.sourceLine, snippet: heading.sourceSnippet },
      });
    }
  }

  // 4. Findings, by signature.
  const oldFindings = findingRefs(db, fromId);
  const newFindings = findingRefs(db, toId);
  const addedFindings = [...newFindings].filter(([s]) => !oldFindings.has(s)).map(([, f]) => f);
  const resolved = [...oldFindings].filter(([s]) => !newFindings.has(s)).map(([, f]) => f);
  const unchanged = [...newFindings.keys()].filter((s) => oldFindings.has(s)).length;

  const report: ImpactReport = {
    from,
    to,
    scenes: sceneChanges,
    facts: { added: added.map((x) => toChange(newState, x)), removed: removed.map((x) => toChange(oldState, x)) },
    touches,
    findings: { added: addedFindings, resolved, unchanged },
    summary: "",
  };
  report.summary = summarize(report);
  return report;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function summarize(r: ImpactReport): string {
  if (r.scenes.length === 0 && r.facts.added.length === 0 && r.facts.removed.length === 0) {
    return `No changes between version ${r.from.version} and version ${r.to.version}.`;
  }
  const verb = (kind: SceneChange["kind"]) => r.scenes.filter((s) => s.kind === kind).map((s) => s.number);
  const parts = [
    verb("changed").length ? `changed scene${verb("changed").length > 1 ? "s" : ""} ${verb("changed").join(", ")}` : null,
    verb("added").length ? `added scene${verb("added").length > 1 ? "s" : ""} ${verb("added").join(", ")}` : null,
    verb("removed").length ? `removed scene${verb("removed").length > 1 ? "s" : ""} ${verb("removed").join(", ")}` : null,
  ].filter(Boolean);
  const head = parts.length ? `You ${parts.join(", ")}.` : "The scene text is unchanged, but some facts moved.";

  const shown = r.touches.slice(0, 6).map((t) => (t.kind === "costume_row" || t.kind === "location_row" ? `${t.label} (${t.source.docName} line ${t.source.line})` : t.label));
  const more = r.touches.length > shown.length ? `, and ${r.touches.length - shown.length} more` : "";
  const touches = r.touches.length ? ` This touches: ${shown.join(", ")}${more}.` : " Nothing else in the story graph depends on what changed.";

  const f = r.findings;
  const findingsText =
    f.added.length || f.resolved.length
      ? ` It creates ${plural(f.added.length, "new finding")} and resolves ${f.resolved.length}.`
      : " It does not change any findings.";
  return head + touches + findingsText;
}

/** Replace one scene's lines in a script (the rest of the file is untouched). */
export function replaceSceneText(raw: string, scene: { startLine: number; endLine: number }, newText: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const replacement = newText.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  return [...lines.slice(0, scene.startLine - 1), ...replacement, ...lines.slice(scene.endLine)].join("\n");
}
