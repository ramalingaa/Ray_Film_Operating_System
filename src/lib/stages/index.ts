import { breakdownStage } from "./breakdown";
import { budgetStage } from "./budget";
import { continuityStage } from "./continuity";
import { intakeStage } from "./intake";
import { locationsStage } from "./locations";
import { scheduleStage } from "./schedule";
import { storyStage } from "./story";
import { storyTestStage } from "./story-test";
import type { StageDef } from "./types";

/** Stages in the order a run executes them. */
export const STAGES: StageDef[] = [storyTestStage, intakeStage, storyStage, continuityStage, breakdownStage, locationsStage, scheduleStage, budgetStage] as StageDef[];

export function getStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}
