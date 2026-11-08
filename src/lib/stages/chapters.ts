/**
 * The production as chapters a team moves through in order. A chapter's
 * stages run only once every earlier chapter is approved; approving the last
 * chapter greenlights the production. Reopening a chapter un-approves it and
 * resets every later chapter, the way a story change ripples downstream.
 */
import type { RunStage } from "../db/schema";

export interface Chapter {
  id: "story" | "script" | "breakdown" | "locations" | "schedule" | "budget";
  numeral: string;
  title: string;
  tagline: string;
  /** Who signs this chapter off in a real production. */
  owner: string;
  stages: RunStage[];
  approveLabel: string;
}

export const CHAPTERS: Chapter[] = [
  { id: "story", numeral: "I", title: "The Story", tagline: "Find the heart of it before a single scene is written.", owner: "Writer and producer", stages: ["story_test"], approveLabel: "Lock the story" },
  {
    id: "script",
    numeral: "II",
    title: "The Screenplay",
    tagline: "Turn the story into scenes, and test every page.",
    owner: "Writer and script supervisor",
    stages: ["intake", "story", "continuity"],
    approveLabel: "Lock the script",
  },
  { id: "breakdown", numeral: "III", title: "The Breakdown", tagline: "Everything every department must bring to set.", owner: "First assistant director", stages: ["breakdown"], approveLabel: "Approve the breakdown" },
  { id: "locations", numeral: "IV", title: "The Places", tagline: "Every set the story needs, by day and by night.", owner: "Location manager", stages: ["locations"], approveLabel: "Approve the locations" },
  { id: "schedule", numeral: "V", title: "The Schedule", tagline: "The order of the shoot, day by day.", owner: "First assistant director", stages: ["schedule"], approveLabel: "Approve the schedule" },
  { id: "budget", numeral: "VI", title: "The Budget", tagline: "What it will take, line by line.", owner: "Line producer", stages: ["budget"], approveLabel: "Greenlight the production" },
];

export const LAST_CHAPTER = CHAPTERS.length - 1;

export function chapterOfStage(stage: RunStage): number {
  return CHAPTERS.findIndex((c) => c.stages.includes(stage));
}

/** Stages allowed to run when chapters up to `approvedThrough` are approved: those of the next chapter and earlier. */
export function runnableStages(approvedThrough: number): RunStage[] {
  return CHAPTERS.slice(0, Math.min(approvedThrough + 1, LAST_CHAPTER) + 1).flatMap((c) => c.stages);
}

export type ChapterState = "locked" | "awaiting_input" | "working" | "ready" | "approved" | "skipped" | "failed";
