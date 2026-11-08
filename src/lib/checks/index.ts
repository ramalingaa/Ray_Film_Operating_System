import { costumeSheetMismatch } from "./costume-sheet-mismatch";
import { impossibleCostumeChange } from "./impossible-costume-change";
import { propLifecycle } from "./prop-lifecycle";
import { timelineOrder } from "./timeline-order";
import type { Check } from "./types";

/** Every registered check. LLM-judged checks (2, 5, 6, 7) are added in M5. */
export const CHECKS: Check[] = [costumeSheetMismatch, impossibleCostumeChange, timelineOrder, propLifecycle];

export function getCheck(id: string): Check | undefined {
  return CHECKS.find((c) => c.id === id);
}
