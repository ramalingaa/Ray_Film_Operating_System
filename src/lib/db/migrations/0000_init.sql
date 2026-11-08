CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent" text NOT NULL,
	"input_ref" text NOT NULL,
	"status" text NOT NULL,
	"model" text,
	"cache_hit" boolean DEFAULT false NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"error" text,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"finished_at" text
);
--> statement-breakpoint
CREATE TABLE "dismissals" (
	"id" serial PRIMARY KEY NOT NULL,
	"finding_signature" text NOT NULL,
	"reason" text,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	CONSTRAINT "dismissals_finding_signature_unique" UNIQUE("finding_signature")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"raw_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"canonical_name" text NOT NULL,
	"aliases_json" text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_merges" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_id" integer NOT NULL,
	"alias" text NOT NULL,
	"rule" text NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"scene_id" integer,
	"kind" text NOT NULL,
	"subject_entity_id" integer,
	"predicate" text NOT NULL,
	"object_value" text NOT NULL,
	"attrs_json" text DEFAULT '{}' NOT NULL,
	"story_day" integer,
	"source_doc_id" integer NOT NULL,
	"source_line" integer NOT NULL,
	"source_snippet" text NOT NULL,
	"confidence" double precision NOT NULL,
	"extracted_by" text NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_id" integer NOT NULL,
	"check_id" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"explanation" text NOT NULL,
	"fact_ids_json" text NOT NULL,
	"scene_numbers_json" text NOT NULL,
	"signature" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"response_json" text NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"severity" text NOT NULL,
	"ref" text NOT NULL,
	"message" text NOT NULL,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_id" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"number" text NOT NULL,
	"heading" text NOT NULL,
	"int_ext" text NOT NULL,
	"location_raw" text NOT NULL,
	"time_of_day" text NOT NULL,
	"is_flashback" boolean DEFAULT false NOT NULL,
	"start_line" integer NOT NULL,
	"end_line" integer NOT NULL,
	"text" text NOT NULL,
	"text_hash" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entity_merges" ADD CONSTRAINT "entity_merges_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_subject_entity_id_entities_id_fk" FOREIGN KEY ("subject_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_doc_id_documents_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_doc_id_documents_id_fk" FOREIGN KEY ("doc_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documents_name_version" ON "documents" USING btree ("name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_kind_name" ON "entities" USING btree ("kind","canonical_name");--> statement-breakpoint
CREATE INDEX "facts_scene" ON "facts" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "facts_subject" ON "facts" USING btree ("subject_entity_id","kind");--> statement-breakpoint
CREATE INDEX "facts_doc" ON "facts" USING btree ("source_doc_id");--> statement-breakpoint
CREATE INDEX "findings_doc" ON "findings" USING btree ("doc_id");--> statement-breakpoint
CREATE INDEX "findings_sig" ON "findings" USING btree ("signature");--> statement-breakpoint
CREATE INDEX "scenes_doc" ON "scenes" USING btree ("doc_id","ordinal");