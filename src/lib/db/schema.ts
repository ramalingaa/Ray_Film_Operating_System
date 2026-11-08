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
import { boolean, doublePrecision, index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

export const documents = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: ["script", "costume_sheet", "location_sheet"] }).notNull(),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    rawText: text("raw_text").notNull(),
    contentHash: text("content_hash").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("documents_name_version").on(t.name, t.version)],
);

export const scenes = pgTable(
  "scenes",
  {
    id: serial("id").primaryKey(),
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
    isFlashback: boolean("is_flashback").notNull().default(false),
    startLine: integer("start_line").notNull(),
    endLine: integer("end_line").notNull(),
    text: text("text").notNull(),
    textHash: text("text_hash").notNull(),
  },
  (t) => [index("scenes_doc").on(t.docId, t.ordinal)],
);

export const entities = pgTable(
  "entities",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: ["character", "location", "prop", "costume"] }).notNull(),
    canonicalName: text("canonical_name").notNull(),
    aliasesJson: text("aliases_json").notNull().default("[]"),
  },
  (t) => [uniqueIndex("entities_kind_name").on(t.kind, t.canonicalName)],
);

/** Audit log for entity resolution: every alias that was folded into an entity. */
export const entityMerges = pgTable("entity_merges", {
  id: serial("id").primaryKey(),
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
  "breakdown_element",
] as const;
export type FactKind = (typeof FACT_KINDS)[number];

export const facts = pgTable(
  "facts",
  {
    id: serial("id").primaryKey(),
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
    confidence: doublePrecision("confidence").notNull(),
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

export const findings = pgTable(
  "findings",
  {
    id: serial("id").primaryKey(),
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

export const dismissals = pgTable("dismissals", {
  id: serial("id").primaryKey(),
  findingSignature: text("finding_signature").notNull().unique(),
  reason: text("reason"),
  createdAt: createdAt(),
});

/** Model responses keyed by hash(scene text + prompt version + model). */
export const llmCache = pgTable("llm_cache", {
  key: text("key").primaryKey(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  responseJson: text("response_json").notNull(),
  createdAt: createdAt(),
});

export const agentRuns = pgTable("agent_runs", {
  id: serial("id").primaryKey(),
  agent: text("agent").notNull(),
  inputRef: text("input_ref").notNull(),
  status: text("status", { enum: ["running", "ok", "failed", "skipped"] }).notNull(),
  model: text("model"),
  cacheHit: boolean("cache_hit").notNull().default(false),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  error: text("error"),
  startedAt: createdAt(),
  finishedAt: text("finished_at"),
});

/** Anything a stage could not do cleanly. Surfaced in the UI, never swallowed. */
export const pipelineIssues = pgTable("pipeline_issues", {
  id: serial("id").primaryKey(),
  stage: text("stage").notNull(),
  severity: text("severity", { enum: ["error", "warning", "info"] }).notNull(),
  ref: text("ref").notNull(),
  message: text("message").notNull(),
  createdAt: createdAt(),
});

export const RUN_STAGES = ["story_test", "intake", "story", "continuity", "breakdown", "locations", "schedule", "budget"] as const;
export type RunStage = (typeof RUN_STAGES)[number];

/**
 * One pass of an input (screenplay or story) through the pipeline. Work
 * advances in short steps; `lockedUntil` (epoch ms) keeps two callers from
 * stepping the same run at once.
 */
export const runs = pgTable("runs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  inputKind: text("input_kind", { enum: ["screenplay", "story"] }).notNull(),
  sourceName: text("source_name").notNull(),
  inputText: text("input_text").notNull(),
  /** Chapter 1: the story being developed (null when the production started from a screenplay). */
  storyText: text("story_text"),
  /** Chapter 2: the screenplay the later stages read (uploaded, edited, or generated from the story). */
  scriptText: text("script_text"),
  /** How chapter 2 gets its screenplay: written from the story ("adapt") or provided by the user ("own"). */
  scriptMode: text("script_mode", { enum: ["adapt", "own"] }),
  /** Index of the last chapter the user approved (-1: none). Stages of later chapters do not run. */
  approvedThrough: integer("approved_through").notNull().default(-1),
  scriptGenerated: boolean("script_generated").notNull().default(false),
  scriptDocId: integer("script_doc_id").references(() => documents.id, { onDelete: "set null" }),
  costumesName: text("costumes_name"),
  costumesText: text("costumes_text"),
  locationsName: text("locations_name"),
  locationsText: text("locations_text"),
  status: text("status", { enum: ["queued", "running", "done", "failed"] }).notNull().default("queued"),
  lockedUntil: doublePrecision("locked_until"),
  createdAt: createdAt(),
  updatedAt: text("updated_at"),
});

export const runStages = pgTable(
  "run_stages",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: RUN_STAGES }).notNull(),
    ordinal: integer("ordinal").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull().default("pending"),
    /** Human-readable progress while running, e.g. "read 6 of 10 scenes". */
    progress: text("progress"),
    reportJson: text("report_json"),
    error: text("error"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
  },
  (t) => [uniqueIndex("run_stages_run_stage").on(t.runId, t.stage)],
);
