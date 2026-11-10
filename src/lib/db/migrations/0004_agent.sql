CREATE TABLE "agent_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"kind" text NOT NULL,
	"tool" text,
	"call_id" text,
	"content" text DEFAULT '' NOT NULL,
	"data_json" text,
	"created_at" text DEFAULT to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "agent_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "agent_locked_until" double precision;--> statement-breakpoint
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_events_run" ON "agent_events" USING btree ("run_id","id");--> statement-breakpoint
ALTER TABLE "agent_events" ENABLE ROW LEVEL SECURITY;