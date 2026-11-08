/**
 * The story graph.
 *
 * Nodes are `entities` (characters, locations, props, costumes) and `scenes`.
 * Edges are `facts`: subject entity --predicate--> object value, always pinned
 * to a source document + line + snippet. A fact without provenance is not
 * allowed to exist (enforced by NOT NULL on the source columns).
 *
 * Everything an agent does is written to `agent_runs`, and anything that went
 * wrong or was skipped is written to `pipeline_issues`, so nothing fails
 * silently.
 */
import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`);

export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["script", "costume_sheet", "location_sheet"] }).notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    rawText: text("raw_text").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("documents_name_version").on(t.name, t.version)],
);

export const scenes = sqliteTable(
  "scenes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    docId: integer("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /** 1-based order in the script. */
    ordinal: integer("ordinal").notNull(),
    /** Scene number as written (#12A#) or the ordinal as text. */
    number: text("number").notNull(),
    heading: text("heading").notNull(),
    intExt: text("int_ext").notNull(),
    locationRaw: text("location_raw").notNull(),
    timeOfDay: text("time_of_day").notNull(),
    isFlashback: integer("is_flashback", { mode: "boolean" }).notNull().default(false),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    text: text("text").notNull(),
    textHash: text("text_hash").notNull(),
  },
  (t) => [index("scenes_doc").on(t.docId, t.ordinal)],
);

export const entities = sqliteTable(
  "entities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["character", "location", "prop", "costume"] }).notNull(),
    canonicalName: text("canonical_name").notNull(),
    aliasesJson: text("aliases_json").notNull().default("[]"),
  },
  (t) => [uniqueIndex("entities_kind_name").on(t.kind, t.canonicalName)],
);

/** Audit log for entity resolution: every alias that was folded into an entity. */
export const entityMerges = sqliteTable("entity_merges", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityId: integer("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  alias: text("alias").notNull(),
  rule: text("rule").notNull(),
  createdAt: createdAt(),
});

export const FACT_KINDS = [
  "appears_in",
  "wears",
  "located_at",
  "time_of_day",
  "story_day",
  "has_prop",
  "prop_state",
  "learns_fact",
  "references_fact",
  "relationship",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const facts = sqliteTable(
  "facts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sceneId: integer("scene_id").references(() => scenes.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: FACT_KINDS }).notNull(),
    subjectEntityId: integer("subject_entity_id").references(() => entities.id),
    predicate: text("predicate").notNull(),
    objectValue: text("object_value").notNull(),
    /** Structured extras (garment state, prop action, day relation, ...). */
    attrsJson: text("attrs_json").notNull().default("{}"),
    storyDay: integer("story_day"),
    sourceDocId: integer("source_doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    sourceLine: integer("source_line").notNull(),
    sourceSnippet: text("source_snippet").notNull(),
    confidence: real("confidence").notNull(),
    /** "parser" | "sheet" | "<provider>:<model>" */
    extractedBy: text("extracted_by").notNull(),
    extractedAt: createdAt(),
  },
  (t) => [
    index("facts_scene").on(t.sceneId),
    index("facts_subject").on(t.subjectEntityId, t.kind),
    index("facts_doc").on(t.sourceDocId),
  ],
);

export const findings = sqliteTable(
  "findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    docId: integer("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    checkId: text("check_id").notNull(),
    severity: text("severity", { enum: ["high", "medium", "low"] }).notNull(),
    title: text("title").notNull(),
    explanation: text("explanation").notNull(),
    factIdsJson: text("fact_ids_json").notNull(),
    sceneNumbersJson: text("scene_numbers_json").notNull(),
    /** Stable across re-runs; used to remember dismissals. */
    signature: text("signature").notNull(),
    status: text("status", { enum: ["open", "dismissed_intentional", "follow_up"] })
      .notNull()
      .default("open"),
    createdAt: createdAt(),
  },
  (t) => [index("findings_doc").on(t.docId), index("findings_sig").on(t.signature)],
);

export const dismissals = sqliteTable("dismissals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  findingSignature: text("finding_signature").notNull().unique(),
  reason: text("reason"),
  createdAt: createdAt(),
});

/** Model responses keyed by hash(scene text + prompt version + model). */
export const llmCache = sqliteTable("llm_cache", {
  key: text("key").primaryKey(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: createdAt(),
});

export const agentRuns = sqliteTable("agent_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  agent: text("agent").notNull(),
  inputRef: text("input_ref").notNull(),
  status: text("status", { enum: ["running", "ok", "failed", "skipped"] }).notNull(),
  model: text("model"),
  cacheHit: integer("cache_hit", { mode: "boolean" }).notNull().default(false),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  error: text("error"),
  startedAt: createdAt(),
  finishedAt: text("finished_at"),
});

/** Anything a stage could not do cleanly. Surfaced in the UI, never swallowed. */
export const pipelineIssues = sqliteTable("pipeline_issues", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  stage: text("stage").notNull(),
  severity: text("severity", { enum: ["error", "warning", "info"] }).notNull(),
  ref: text("ref").notNull(),
  message: text("message").notNull(),
  createdAt: createdAt(),
});
