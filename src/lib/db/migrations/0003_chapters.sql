ALTER TABLE "runs" ADD COLUMN "story_text" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "script_mode" text;--> statement-breakpoint
ALTER TABLE "runs" ADD COLUMN "approved_through" integer DEFAULT -1 NOT NULL;--> statement-breakpoint
UPDATE "runs" SET "story_text" = "input_text", "script_mode" = 'adapt' WHERE "input_kind" = 'story';--> statement-breakpoint
UPDATE "runs" SET "script_mode" = 'own' WHERE "input_kind" = 'screenplay';--> statement-breakpoint
UPDATE "runs" SET "approved_through" = 5;
