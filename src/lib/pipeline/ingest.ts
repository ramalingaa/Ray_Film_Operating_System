/**
 * Ingest orchestrator: documents → scenes → per-scene extraction agent →
 * provenance verification → entity resolution → story days → facts.
 *
 * Deterministic facts (cues, headings, explicit days, sheets) are always
 * written. Model facts are added when a gateway is available. Every dropped
 * item, skipped scene, or ambiguity becomes a pipeline issue.
 */
import crypto from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { runAgent, type AgentContext } from "../agents/runtime";
import type { Db } from "../db/client";
import { documents, entities, entityMerges, facts, scenes } from "../db/schema";
import { isExtractionCached, sceneExtractor } from "../extract/agent";
import {
  normalizeCharacterName,
  normalizeLocationName,
  normalizePropName,
  resolveCharacters,
  resolveLocations,
  resolveProps,
  type Merge,
} from "../extract/entities";
import { verifySource } from "../extract/provenance";
import type { SceneExtraction } from "../extract/schema";
import { resolveStoryDays, type DayEvidence } from "../extract/story-days";
import { parseFountain, type ParsedScene } from "../fountain";
import { parseCostumeSheet, parseLocationSheet, type CostumeRow, type LocationRow } from "../sheets";

type DocKind = "script" | "costume_sheet" | "location_sheet";
type FactInsert = typeof facts.$inferInsert;
type EntityKind = "character" | "location" | "prop";

export interface SourceFile {
  name: string;
  text: string;
}

export interface IngestInput {
  script: SourceFile;
  costumes?: SourceFile;
  locations?: SourceFile;
}

export interface IngestReport {
  scriptDocId: number;
  scriptVersion: number;
  costumeDocId?: number;
  locationDocId?: number;
  sceneCount: number;
  factCount: number;
  extractedScenes: number;
  cachedScenes: number;
  skippedScenes: number;
  /** Scenes not read yet because the time budget ran out; call ingest again to continue. */
  deferredScenes: number;
  droppedItems: number;
}

export interface IngestOptions {
  /** Epoch ms. After this, scenes that would need a new model call are deferred. */
  deadline?: number;
}

const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Same content → same document (derived rows rebuilt). New content → new version. */
async function upsertDocument(db: Db, kind: DocKind, file: SourceFile): Promise<{ id: number; version: number }> {
  const contentHash = hash(file.text);
  const [latest] = await db.select().from(documents).where(eq(documents.name, file.name)).orderBy(desc(documents.version)).limit(1);
  if (latest && latest.contentHash === contentHash && latest.kind === kind) {
    await db.delete(facts).where(eq(facts.sourceDocId, latest.id));
    await db.delete(scenes).where(eq(scenes.docId, latest.id));
    return { id: latest.id, version: latest.version };
  }
  const version = (latest?.version ?? 0) + 1;
  const [row] = await db.insert(documents).values({ kind, name: file.name, version, rawText: file.text, contentHash }).returning({ id: documents.id });
  return { id: row.id, version };
}

/** A short, deterministic recap of earlier scenes so the model can resolve names and days. */
function buildSummary(done: { scene: ParsedScene; x?: SceneExtraction }[], dayOf: (ordinal: number) => number | null): string {
  if (done.length === 0) return "";
  const characters = new Set<string>();
  const lastCostume = new Map<string, string>();
  const props = new Map<string, string>();
  const learned: string[] = [];
  for (const { scene, x } of done) {
    scene.speakers.forEach((s) => characters.add(s));
    if (!x) continue;
    x.characters.forEach((c) => characters.add(c.name.toUpperCase()));
    for (const c of x.costumes) lastCostume.set(c.character.toUpperCase(), `${c.garment}${c.state !== "normal" ? ` (${c.state})` : ""}`);
    for (const p of x.props) props.set(p.name.toLowerCase(), `${p.action}${p.holder ? `, with ${p.holder}` : ""} (scene ${scene.number})`);
    for (const k of x.knowledge) if (k.kind === "learns") learned.push(`${k.character} learned: ${k.fact} (scene ${scene.number})`);
  }
  const last = done[done.length - 1].scene;
  const day = dayOf(last.ordinal);
  return [
    `Characters introduced: ${[...characters].join(", ")}`,
    `Previous scene: ${last.number} ${last.heading} — story day ${day ?? "unknown"}`,
    lastCostume.size ? `Last described costumes: ${[...lastCostume].map(([c, g]) => `${c}: ${g}`).join("; ")}` : null,
    props.size ? `Props so far: ${[...props].map(([p, s]) => `${p} — ${s}`).join("; ")}` : null,
    learned.length ? `Information learned so far:\n- ${learned.slice(-10).join("\n- ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

const PLACEHOLDER = /^(none|n\/?a|null|nil|unknown|unnamed|nobody|nothing|no one|-+|\?+)$/i;

/** True when any value in a label like "costume ELENA: none" is a placeholder. */
export function isPlaceholder(label: string): boolean {
  // Labels look like "costume ELENA: none", "equipment none", "character UNKNOWN".
  const rest = label.slice(label.indexOf(" ") + 1);
  return rest.split(/[:–]/).some((v) => PLACEHOLDER.test(v.trim()));
}

/** Drop items whose source pointer cannot be verified against the scene text. */
function verifyExtraction(scene: ParsedScene, x: SceneExtraction, onDrop: (what: string, reason: string) => void): SceneExtraction {
  const keep = <T extends { source_line: number; source_snippet: string }>(items: T[], label: (t: T) => string): T[] =>
    items.flatMap((item) => {
      // Placeholders ("none", "unknown", "n/a") are not facts, even with a real quote.
      if (isPlaceholder(label(item))) {
        onDrop(label(item), "placeholder value, not a fact");
        return [];
      }
      const v = verifySource(scene, item.source_line, item.source_snippet);
      if (!v.ok) {
        onDrop(label(item), v.reason);
        return [];
      }
      return [{ ...item, source_line: v.line, source_snippet: v.snippet }];
    });

  const setting = verifySource(scene, x.setting.source_line, x.setting.source_snippet);
  const day = verifySource(scene, x.story_day.source_line, x.story_day.source_snippet);
  return {
    characters: keep(x.characters, (c) => `character ${c.name}`),
    setting: setting.ok ? { ...x.setting, source_line: setting.line, source_snippet: setting.snippet } : { ...x.setting, source_line: scene.startLine, source_snippet: scene.heading },
    location_details: keep(x.location_details, (d) => `location detail ${d.detail}`),
    time_of_day_evidence: keep(x.time_of_day_evidence, (t) => `time cue ${t.implies}`),
    story_day: day.ok
      ? { ...x.story_day, source_line: day.line, source_snippet: day.snippet }
      : { ...x.story_day, relation: x.story_day.relation === "explicit" ? "unknown" : x.story_day.relation, day: null, source_line: scene.startLine, source_snippet: scene.heading },
    costumes: keep(x.costumes, (c) => `costume ${c.character}: ${c.garment}`),
    // A placeholder holder ("unknown") means no holder, not a character.
    props: keep(x.props, (p) => `prop ${p.name}`).map((p) => ({ ...p, holder: p.holder && !PLACEHOLDER.test(p.holder.trim()) ? p.holder : null })),
    knowledge: keep(x.knowledge, (k) => `knowledge ${k.character}: ${k.fact}`),
    relationships: keep(x.relationships, (r) => `relationship ${r.a}–${r.b}`),
    breakdown: keep(x.breakdown, (b) => `${b.category} ${b.item}`),
  };
}

/**
 * Entity ids by kind and canonical name. `ensure` creates (or finds) entities
 * in bulk up front, so that `id` is a plain synchronous lookup while facts are built.
 */
class EntityStore {
  private readonly ids = new Map<string, number>();
  constructor(private readonly db: Db) {}

  private static key(kind: EntityKind, canonical: string): string {
    return `${kind}\u0000${canonical}`;
  }

  async ensure(kind: EntityKind, names: Iterable<string>): Promise<void> {
    const missing = [...new Set(names)].filter((n) => !this.ids.has(EntityStore.key(kind, n)));
    if (missing.length === 0) return;
    await this.db
      .insert(entities)
      .values(missing.map((canonicalName) => ({ kind, canonicalName })))
      .onConflictDoNothing({ target: [entities.kind, entities.canonicalName] });
    const rows = await this.db
      .select({ id: entities.id, name: entities.canonicalName })
      .from(entities)
      .where(and(eq(entities.kind, kind), inArray(entities.canonicalName, missing)));
    for (const r of rows) this.ids.set(EntityStore.key(kind, r.name), r.id);
  }

  id(kind: EntityKind, canonical: string): number {
    const id = this.ids.get(EntityStore.key(kind, canonical));
    if (id === undefined) throw new Error(`entity ${kind} "${canonical}" was not prepared before use`);
    return id;
  }

  async recordMerges(kind: EntityKind, merges: Merge[]): Promise<void> {
    await this.ensure(kind, merges.map((m) => m.canonical));
    for (const m of merges) {
      const entityId = this.id(kind, m.canonical);
      const [row] = await this.db.select().from(entities).where(eq(entities.id, entityId));
      const aliases = new Set<string>(JSON.parse(row.aliasesJson));
      if (aliases.has(m.alias)) continue;
      aliases.add(m.alias);
      await this.db.update(entities).set({ aliasesJson: JSON.stringify([...aliases].sort()) }).where(eq(entities.id, entityId));
      await this.db.insert(entityMerges).values({ entityId, alias: m.alias, rule: m.rule });
    }
  }
}

export async function ingest(ctx: AgentContext, input: IngestInput, opts: IngestOptions = {}): Promise<IngestReport> {
  const { db, ledger } = ctx;
  const script = await upsertDocument(db, "script", input.script);
  const costumeDoc = input.costumes ? await upsertDocument(db, "costume_sheet", input.costumes) : undefined;
  const locationDoc = input.locations ? await upsertDocument(db, "location_sheet", input.locations) : undefined;

  const parsed = parseFountain(input.script.text);
  if (parsed.scenes.length === 0) await ledger.issue("parse", "error", input.script.name, "no scene headings found");

  let costumeRows: CostumeRow[] = [];
  let locationRows: LocationRow[] = [];
  try {
    if (input.costumes) costumeRows = parseCostumeSheet(input.costumes.text);
  } catch (err) {
    await ledger.issue("sheets", "error", input.costumes!.name, (err as Error).message);
  }
  try {
    if (input.locations) locationRows = parseLocationSheet(input.locations.text);
  } catch (err) {
    await ledger.issue("sheets", "error", input.locations!.name, (err as Error).message);
  }

  const sceneIds = new Map<number, number>();
  const sceneRows = parsed.scenes.length
    ? await db
        .insert(scenes)
        .values(
          parsed.scenes.map((s) => ({
            docId: script.id,
        ordinal: s.ordinal,
        number: s.number,
        heading: s.heading,
        intExt: s.intExt,
        locationRaw: s.location,
        timeOfDay: s.timeOfDay,
        isFlashback: s.isFlashback,
        startLine: s.startLine,
        endLine: s.endLine,
        text: s.text,
        textHash: hash(s.text),
          })),
        )
        .returning({ id: scenes.id, ordinal: scenes.ordinal })
    : [];
  for (const r of sceneRows) sceneIds.set(r.ordinal, r.id);

  // --- Model extraction, one scene at a time with a rolling summary ---------
  const extractions = new Map<number, { x: SceneExtraction; model: string }>();
  let extractedScenes = 0;
  let cachedScenes = 0;
  let skippedScenes = 0;
  let deferredScenes = 0;
  let droppedItems = 0;
  const done: { scene: ParsedScene; x?: SceneExtraction }[] = [];
  const evidence: DayEvidence[] = [];
  const dayEvidence = (s: ParsedScene, x?: SceneExtraction): DayEvidence => ({
    ordinal: s.ordinal,
    isFlashback: s.isFlashback,
    timeOfDay: s.timeOfDay,
    parserDay: s.explicitDay?.day,
    model: x ? { relation: x.story_day.relation, day: x.story_day.day } : undefined,
  });

  if (!ctx.gateway) {
    await ledger.issue("extract", "warning", input.script.name, "no model configured: only deterministic facts (cues, headings, explicit days, sheets) were extracted");
  }
  for (const scene of parsed.scenes) {
    let x: SceneExtraction | undefined;
    if (ctx.gateway && (deferredScenes > 0 || (opts.deadline !== undefined && Date.now() > opts.deadline))) {
      // Out of time: keep order (later scenes need earlier summaries), so defer this and every later uncached scene.
      if (deferredScenes > 0 || !(await isExtractionCached(db, scene.text, ctx.gateway.specs("extract")))) {
        deferredScenes++;
        done.push({ scene, x });
        evidence.push(dayEvidence(scene, x));
        continue;
      }
    }
    if (ctx.gateway) {
      const days = resolveStoryDays(evidence);
      const summary = buildSummary(done, (o) => days.find((d) => d.ordinal === o)?.day ?? null);
      try {
        const out = await runAgent(sceneExtractor, { scene, summary, title: parsed.titlePage.title }, ctx, `${input.script.name}#scene-${scene.number}`);
        const drops: string[] = [];
        x = verifyExtraction(scene, out.extraction, (what, reason) => drops.push(`dropped ${what}: ${reason}`));
        droppedItems += drops.length;
        for (const d of drops) await ledger.issue("verify", "warning", `scene ${scene.number}`, d);
        extractions.set(scene.ordinal, { x, model: out.model });
        extractedScenes++;
        if (out.cacheHit) cachedScenes++;
      } catch {
        skippedScenes++;
      }
    }
    done.push({ scene, x });
    evidence.push(dayEvidence(scene, x));
  }

  // --- Entity resolution -----------------------------------------------------
  const characterNames = new Set<string>();
  const propNames = new Set<string>();
  for (const s of parsed.scenes) s.speakers.forEach((n) => characterNames.add(n));
  for (const { x } of extractions.values()) {
    x.characters.forEach((c) => characterNames.add(c.name));
    x.costumes.forEach((c) => characterNames.add(c.character));
    x.knowledge.forEach((k) => characterNames.add(k.character));
    x.relationships.forEach((r) => (characterNames.add(r.a), characterNames.add(r.b)));
    x.props.forEach((p) => {
      propNames.add(p.name);
      if (p.holder) characterNames.add(p.holder);
    });
  }
  costumeRows.forEach((r) => characterNames.add(r.character));

  const chars = resolveCharacters(characterNames);
  const props = resolveProps(propNames);
  const locs = resolveLocations(parsed.scenes.map((s) => s.location), locationRows);
  const store = new EntityStore(db);
  await store.recordMerges("character", chars.merges);
  await store.recordMerges("prop", props.merges);
  await store.recordMerges("location", locs.merges);
  const canonicalChar = (raw: string) => {
    const n = normalizeCharacterName(raw);
    return chars.map.get(n) ?? n;
  };
  const canonicalProp = (raw: string) => {
    const n = normalizePropName(raw);
    return props.map.get(n) ?? n;
  };
  const canonicalLoc = (raw: string) => {
    const n = normalizeLocationName(raw);
    return locs.map.get(n) ?? n;
  };
  await store.ensure("character", [...characterNames].map(canonicalChar));
  await store.ensure("prop", [...propNames].map(canonicalProp));
  await store.ensure("location", [...parsed.scenes.map((s) => canonicalLoc(s.location)), ...locationRows.map((r) => normalizeLocationName(r.name))]);
  for (const a of [...chars.ambiguous, ...props.ambiguous]) {
    await ledger.issue("resolve", "info", a.name, `left unmerged: matches ${a.candidates.join(", ")}`);
  }
  const charId = (raw: string) => store.id("character", canonicalChar(raw));
  const propId = (raw: string) => store.id("prop", canonicalProp(raw));
  const locId = (raw: string) => store.id("location", canonicalLoc(raw));

  const days = resolveStoryDays(evidence);
  const dayOf = new Map(days.map((d) => [d.ordinal, d]));

  // --- Facts ------------------------------------------------------------------
  const rows: FactInsert[] = [];
  const base = (sceneOrdinal: number | null, docId: number, extractedBy: string, confidence: number) => ({
    sceneId: sceneOrdinal == null ? null : sceneIds.get(sceneOrdinal)!,
    storyDay: sceneOrdinal == null ? null : (dayOf.get(sceneOrdinal)?.day ?? null),
    sourceDocId: docId,
    extractedBy,
    confidence,
  });

  for (const s of parsed.scenes) {
    const det = base(s.ordinal, script.id, "parser", 1);
    const d = dayOf.get(s.ordinal)!;
    const headingFact = { ...det, sourceLine: s.startLine, sourceSnippet: s.heading };
    rows.push({ ...headingFact, kind: "located_at", subjectEntityId: locId(s.location), predicate: "scene_location", objectValue: s.number, attrsJson: JSON.stringify({ intExt: s.intExt }) });
    rows.push({ ...headingFact, kind: "time_of_day", predicate: "heading_time", objectValue: s.timeOfDay });
    rows.push({
      ...det,
      kind: "story_day",
      predicate: "story_day",
      objectValue: d.day == null ? "unknown" : String(d.day),
      confidence: d.confidence,
      sourceLine: s.explicitDay?.line ?? s.startLine,
      sourceSnippet: s.explicitDay?.snippet ?? s.heading,
      attrsJson: JSON.stringify({ basis: d.basis, flashback: s.isFlashback }),
    });
    const seenSpeakers = new Set<number>();
    for (const el of s.elements) {
      if (el.type !== "character" || !el.character) continue;
      const id = charId(el.character);
      if (seenSpeakers.has(id)) continue;
      seenSpeakers.add(id);
      rows.push({ ...det, kind: "appears_in", subjectEntityId: id, predicate: "speaks_in", objectValue: s.number, sourceLine: el.line, sourceSnippet: el.text, attrsJson: JSON.stringify({ speaking: true }) });
    }

    const ex = extractions.get(s.ordinal);
    if (!ex) continue;
    const { x, model } = ex;
    const m = (conf = 0.9) => base(s.ordinal, script.id, model, conf);
    for (const c of x.characters) {
      const id = charId(c.name);
      if (seenSpeakers.has(id)) continue;
      seenSpeakers.add(id);
      rows.push({ ...m(), kind: "appears_in", subjectEntityId: id, predicate: "present_in", objectValue: s.number, sourceLine: c.source_line, sourceSnippet: c.source_snippet, attrsJson: JSON.stringify({ speaking: c.speaking }) });
    }
    for (const d of x.location_details) {
      rows.push({ ...m(0.8), kind: "located_at", subjectEntityId: locId(s.location), predicate: "location_detail", objectValue: d.detail, sourceLine: d.source_line, sourceSnippet: d.source_snippet });
    }
    for (const t of x.time_of_day_evidence) {
      rows.push({ ...m(0.8), kind: "time_of_day", predicate: "implied_time", objectValue: t.implies, sourceLine: t.source_line, sourceSnippet: t.source_snippet });
    }
    for (const c of x.costumes) {
      rows.push({
        ...m(),
        kind: "wears",
        subjectEntityId: charId(c.character),
        predicate: "wears",
        objectValue: c.garment,
        sourceLine: c.source_line,
        sourceSnippet: c.source_snippet,
        attrsJson: JSON.stringify({ state: c.state, stateDetail: c.state_detail, changesInto: c.changes_into }),
      });
    }
    for (const p of x.props) {
      const attrs = JSON.stringify({ action: p.action, holder: p.holder ? chars.map.get(normalizeCharacterName(p.holder)) ?? normalizeCharacterName(p.holder) : null, fixedInPlace: p.fixed_in_place, state: p.state });
      rows.push({ ...m(), kind: "prop_state", subjectEntityId: propId(p.name), predicate: p.action, objectValue: p.state ?? p.action, sourceLine: p.source_line, sourceSnippet: p.source_snippet, attrsJson: attrs });
      if (p.holder) {
        rows.push({ ...m(), kind: "has_prop", subjectEntityId: charId(p.holder), predicate: "holds", objectValue: props.map.get(normalizePropName(p.name)) ?? normalizePropName(p.name), sourceLine: p.source_line, sourceSnippet: p.source_snippet });
      }
    }
    for (const k of x.knowledge) {
      rows.push({ ...m(0.8), kind: k.kind === "learns" ? "learns_fact" : "references_fact", subjectEntityId: charId(k.character), predicate: k.kind, objectValue: k.fact, sourceLine: k.source_line, sourceSnippet: k.source_snippet });
    }
    for (const b of x.breakdown) {
      rows.push({ ...m(0.85), kind: "breakdown_element", predicate: b.category, objectValue: b.item, sourceLine: b.source_line, sourceSnippet: b.source_snippet, attrsJson: JSON.stringify({ detail: b.detail }) });
    }
    for (const r of x.relationships) {
      const b = normalizeCharacterName(r.b);
      rows.push({ ...m(0.8), kind: "relationship", subjectEntityId: charId(r.a), predicate: r.relation, objectValue: chars.map.get(b) ?? b, sourceLine: r.source_line, sourceSnippet: r.source_snippet });
    }
  }

  if (costumeDoc) {
    for (const r of costumeRows) {
      rows.push({
        ...base(null, costumeDoc.id, "sheet", 1),
        storyDay: r.storyDay,
        kind: "wears",
        subjectEntityId: charId(r.character),
        predicate: "sheet_costume",
        objectValue: r.costume,
        sourceLine: r.line,
        sourceSnippet: r.snippet,
        attrsJson: JSON.stringify({ scenes: r.scenes, state: r.state }),
      });
    }
  }
  if (locationDoc) {
    for (const r of locationRows) {
      rows.push({
        ...base(null, locationDoc.id, "sheet", 1),
        kind: "located_at",
        subjectEntityId: store.id("location", normalizeLocationName(r.name)),
        predicate: "sheet_location",
        objectValue: r.notes || r.name,
        sourceLine: r.line,
        sourceSnippet: r.snippet,
        attrsJson: JSON.stringify({ intExt: r.intExt, aliases: r.aliases }),
      });
    }
  }

  await db.transaction(async (tx) => {
    for (let i = 0; i < rows.length; i += 200) await tx.insert(facts).values(rows.slice(i, i + 200));
  });

  return {
    scriptDocId: script.id,
    scriptVersion: script.version,
    costumeDocId: costumeDoc?.id,
    locationDocId: locationDoc?.id,
    sceneCount: parsed.scenes.length,
    factCount: rows.length,
    extractedScenes,
    cachedScenes,
    skippedScenes,
    deferredScenes,
    droppedItems,
  };
}
