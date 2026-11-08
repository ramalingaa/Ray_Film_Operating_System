import { continuityStage } from "./continuity";
import { intakeStage } from "./intake";
import type { StageDef } from "./types";

/** Stages in the order a run executes them. */
export const STAGES: StageDef[] = [intakeStage, continuityStage] as StageDef[];

export function getStage(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id);
}
