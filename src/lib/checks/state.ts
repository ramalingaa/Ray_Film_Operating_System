import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { documents, entities, facts, scenes } from "../db/schema";
import type { BibleState, FactInfo, SceneInfo } from "./types";

/** Latest version of each production sheet, used alongside a script version. */
function latestSheetIds(db: Db): number[] {
  const ids: number[] = [];
  for (const kind of ["costume_sheet", "location_sheet"] as const) {
    const row = db.select({ id: documents.id }).from(documents).where(eq(documents.kind, kind)).orderBy(desc(documents.version), desc(documents.id)).limit(1).get();
    if (row) ids.push(row.id);
  }
  return ids;
}

/** Load the snapshot that checks run on: one script version plus the latest sheets. */
export function loadState(db: Db, docId: number): BibleState {
  const sheetIds = latestSheetIds(db);
  const docNames = new Map(db.select({ id: documents.id, name: documents.name }).from(documents).all().map((d) => [d.id, d.name]));

  const factRows = db
    .select()
    .from(facts)
    .where(or(eq(facts.sourceDocId, docId), sheetIds.length ? and(isNull(facts.sceneId), inArray(facts.sourceDocId, sheetIds)) : undefined))
    .all();

  const factInfos: FactInfo[] = factRows.map((f) => ({
    id: f.id,
    sceneId: f.sceneId,
    kind: f.kind,
    subjectEntityId: f.subjectEntityId,
    predicate: f.predicate,
    objectValue: f.objectValue,
    attrs: JSON.parse(f.attrsJson) as Record<string, unknown>,
    storyDay: f.storyDay,
    sourceDocId: f.sourceDocId,
    sourceDocName: docNames.get(f.sourceDocId) ?? `document ${f.sourceDocId}`,
    sourceLine: f.sourceLine,
    sourceSnippet: f.sourceSnippet,
    confidence: f.confidence,
    extractedBy: f.extractedBy,
  }));

  const dayBySceneId = new Map<number, FactInfo>();
  const locBySceneId = new Map<number, number>();
  for (const f of factInfos) {
    if (f.sceneId == null) continue;
    if (f.kind === "story_day") dayBySceneId.set(f.sceneId, f);
    if (f.kind === "located_at" && f.predicate === "scene_location" && f.subjectEntityId != null) locBySceneId.set(f.sceneId, f.subjectEntityId);
  }

  const sceneInfos: SceneInfo[] = db
    .select()
    .from(scenes)
    .where(eq(scenes.docId, docId))
    .orderBy(scenes.ordinal)
    .all()
    .map((s) => {
      const day = dayBySceneId.get(s.id);
      return {
        id: s.id,
        ordinal: s.ordinal,
        number: s.number,
        heading: s.heading,
        timeOfDay: s.timeOfDay,
        isFlashback: s.isFlashback,
        storyDay: day?.storyDay ?? null,
        dayBasis: String(day?.attrs.basis ?? "unknown"),
        locationEntityId: locBySceneId.get(s.id) ?? null,
        startLine: s.startLine,
      };
    });

  const entityNames = new Map(db.select({ id: entities.id, name: entities.canonicalName }).from(entities).all().map((e) => [e.id, e.name]));
  return { docId, scenes: sceneInfos, facts: factInfos, entityNames };
}
