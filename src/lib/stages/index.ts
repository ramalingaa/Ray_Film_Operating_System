import { continuityStage } from "./continuity";
import { intakeStage } from "./intake";
import { storyStage } from "./story";
import type { StageDef } from "./types";

/** Stages in the order a run executes them. */
export const STAGES: StageDef[] = [intakeStage, storyStage, continuityStage] as StageDef[];

export function getStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}
