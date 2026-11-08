CREATE TABLE `agent_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent` text NOT NULL,
	`input_ref` text NOT NULL,
	`status` text NOT NULL,
	`model` text,
	`cache_hit` integer DEFAULT false NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`error` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `dismissals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`finding_signature` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissals_finding_signature_unique` ON `dismissals` (`finding_signature`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`version` integer NOT NULL,
	`raw_text` text NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_name_version` ON `documents` (`name`,`version`);--> statement-breakpoint
CREATE TABLE `entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`canonical_name` text NOT NULL,
	`aliases_json` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entities_kind_name` ON `entities` (`kind`,`canonical_name`);--> statement-breakpoint
CREATE TABLE `entity_merges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` integer NOT NULL,
	`alias` text NOT NULL,
	`rule` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `facts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scene_id` integer,
	`kind` text NOT NULL,
	`subject_entity_id` integer,
	`predicate` text NOT NULL,
	`object_value` text NOT NULL,
	`attrs_json` text DEFAULT '{}' NOT NULL,
	`story_day` integer,
	`source_doc_id` integer NOT NULL,
	`source_line` integer NOT NULL,
	`source_snippet` text NOT NULL,
	`confidence` real NOT NULL,
	`extracted_by` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scenes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_entity_id`) REFERENCES `entities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_doc_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `facts_scene` ON `facts` (`scene_id`);--> statement-breakpoint
CREATE INDEX `facts_subject` ON `facts` (`subject_entity_id`,`kind`);--> statement-breakpoint
CREATE INDEX `facts_doc` ON `facts` (`source_doc_id`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_id` integer NOT NULL,
	`check_id` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`explanation` text NOT NULL,
	`fact_ids_json` text NOT NULL,
	`scene_numbers_json` text NOT NULL,
	`signature` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `findings_doc` ON `findings` (`doc_id`);--> statement-breakpoint
CREATE INDEX `findings_sig` ON `findings` (`signature`);--> statement-breakpoint
CREATE TABLE `llm_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`response_json` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pipeline_issues` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`stage` text NOT NULL,
	`severity` text NOT NULL,
	`ref` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scenes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`doc_id` integer NOT NULL,
	`ordinal` integer NOT NULL,
	`number` text NOT NULL,
	`heading` text NOT NULL,
	`int_ext` text NOT NULL,
	`location_raw` text NOT NULL,
	`time_of_day` text NOT NULL,
	`is_flashback` integer DEFAULT false NOT NULL,
	`start_line` integer NOT NULL,
	`end_line` integer NOT NULL,
	`text` text NOT NULL,
	`text_hash` text NOT NULL,
	FOREIGN KEY (`doc_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenes_doc` ON `scenes` (`doc_id`,`ordinal`);