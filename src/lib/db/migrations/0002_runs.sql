CREATE TABLE "run_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"stage" text NOT NULL,
	"ordinal" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" text,
	"report_json" text,
	"error" text,
	"started_at" text,
	"finished_at" text
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"input_kind" text NOT NULL,
	"source_name" text NOT NULL,
	"input_text" text NOT NULL,
	"script_text" text,
	"script_generated" boolean DEFAULT false NOT NULL,
	"script_doc_id" integer,
	"costumes_name" text,
	"costumes_text" text,
	"locations_name" text,
	"locations_text" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"locked_until" double precision,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text
);
--> statement-breakpoint
ALTER TABLE "run_stages" ADD CONSTRAINT "run_stages_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_script_doc_id_documents_id_fk" FOREIGN KEY ("script_doc_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_stages_run_stage" ON "run_stages" USING btree ("run_id","stage");--> statement-breakpoint
ALTER TABLE "runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "run_stages" ENABLE ROW LEVEL SECURITY;
