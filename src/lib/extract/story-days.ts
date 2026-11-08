/**
 * Turn per-scene day evidence into absolute story days. Deterministic: the
 * model only reports the relation ("next_day"), code does the arithmetic.
 */
import type { DAY_RELATIONS } from "./schema";

export type DayRelation = (typeof DAY_RELATIONS)[number];

export interface DayEvidence {
  ordinal: number;
  isFlashback: boolean;
  timeOfDay: string;
  /** Detected by the parser (SUPER: DAY 2, "- DAY 2" in the heading). */
  parserDay?: number;
  /** Reported by the extraction model, if it ran. */
  model?: { relation: DayRelation; day: number | null };
}

export interface ResolvedDay {
  ordinal: number;
  day: number | null;
  basis: "explicit" | "continuity" | "model_relation" | "assumed" | "flashback" | "unknown";
  confidence: number;
}

const CONTINUOUS_TIMES = new Set(["CONTINUOUS", "MOMENTS LATER", "SECONDS LATER", "MINUTES LATER", "SAME", "SAME TIME", "LATER"]);

export function resolveStoryDays(evidence: DayEvidence[]): ResolvedDay[] {
  let current: number | null = null;
  return evidence.map((e) => {
    const explicit = e.parserDay ?? (e.model?.relation === "explicit" && e.model.day != null ? e.model.day : undefined);

    if (e.isFlashback) {
      return { ordinal: e.ordinal, day: explicit ?? null, basis: explicit != null ? "explicit" : "flashback", confidence: explicit != null ? 1 : 0 };
    }
    if (explicit != null) {
      current = explicit;
      return { ordinal: e.ordinal, day: explicit, basis: "explicit", confidence: e.parserDay != null ? 1 : 0.9 };
    }
    if (current != null && CONTINUOUS_TIMES.has(e.timeOfDay)) {
      return { ordinal: e.ordinal, day: current, basis: "continuity", confidence: 1 };
    }
    switch (e.model?.relation) {
      case "same_day":
        current ??= 1;
        return { ordinal: e.ordinal, day: current, basis: "model_relation", confidence: 0.8 };
      case "next_day":
        current = (current ?? 0) + 1;
        return { ordinal: e.ordinal, day: current, basis: "model_relation", confidence: 0.8 };
      case "later":
        current ??= 1;
        return { ordinal: e.ordinal, day: current, basis: "model_relation", confidence: 0.6 };
      case "earlier":
        return { ordinal: e.ordinal, day: null, basis: "unknown", confidence: 0 };
    }
    if (current == null) {
      current = 1;
      return { ordinal: e.ordinal, day: 1, basis: "assumed", confidence: 0.7 };
    }
    return { ordinal: e.ordinal, day: current, basis: "assumed", confidence: 0.5 };
  });
}
