import { characterKnowledge } from "./character-knowledge";
import { costumeSheetMismatch } from "./costume-sheet-mismatch";
import { costumeStateCarryover } from "./costume-state-carryover";
import { impossibleCostumeChange } from "./impossible-costume-change";
import { locationConsistency } from "./location-consistency";
import { propLifecycle } from "./prop-lifecycle";
import { timeOfDayConflict } from "./time-of-day-conflict";
import { timelineOrder } from "./timeline-order";
import type { Check } from "./types";

/** Every registered check, in the order of the spec. */
export const CHECKS: Check[] = [
  costumeSheetMismatch,
  costumeStateCarryover,
  impossibleCostumeChange,
  timelineOrder,
  timeOfDayConflict,
  locationConsistency,
  characterKnowledge,
  propLifecycle,
];

export function getCheck(id: string): Check | undefined {
  return CHECKS.find((c) => c.id === id);
}
