import { quote, sceneIndex, type JudgeCandidate, type JudgedCheck, type SceneInfo } from "./types";

type Bucket = "dawn" | "morning" | "day" | "evening" | "dusk" | "night";

const HEADING_BUCKET: Record<string, Bucket> = {
  DAWN: "dawn",
  SUNRISE: "dawn",
  "EARLY MORNING": "morning",
  MORNING: "morning",
  DAY: "day",
  NOON: "day",
  AFTERNOON: "day",
  EVENING: "evening",
  DUSK: "dusk",
  SUNSET: "dusk",
  "MAGIC HOUR": "dusk",
  NIGHT: "night",
  "LATE NIGHT": "night",
  MIDNIGHT: "night",
};

/** Pairs that cannot both be true of one scene. Neighbouring times (dusk/evening, dawn/morning) never conflict. */
const INCOMPATIBLE: Record<Bucket, Bucket[]> = {
  dawn: ["day", "evening", "night"],
  morning: ["evening", "dusk", "night"],
  day: ["dawn", "night"],
  evening: ["dawn", "morning"],
  dusk: ["dawn", "morning"],
  night: ["morning", "day"],
};

/** CONTINUOUS / MOMENTS LATER inherit the time of the scene before. */
export function effectiveTime(scenes: SceneInfo[], ordinal: number): { bucket?: Bucket; from: SceneInfo } {
  for (let i = ordinal - 1; i >= 0; i--) {
    const s = scenes[i];
    const bucket = HEADING_BUCKET[s.timeOfDay];
    if (bucket) return { bucket, from: s };
    if (!["CONTINUOUS", "MOMENTS LATER", "SECONDS LATER", "SAME", "SAME TIME", "LATER"].includes(s.timeOfDay)) break;
  }
  return { from: scenes[ordinal - 1] };
}

/** Heading says one time of day; action or dialogue in the same scene implies an incompatible one. */
export const timeOfDayConflict: JudgedCheck = {
  id: "time_of_day_conflict",
  title: "Heading and scene disagree on the time of day",
  kind: "llm_judge",
  question:
    "Does the quoted action or dialogue clearly place this scene at a time of day that contradicts its heading? Lamps, neon, candles or overcast light are not contradictions on their own; a stated hour, the sun high in the sky, or morning light in a NIGHT scene are.",
  candidates(state) {
    const scenes = sceneIndex(state);
    const out: JudgeCandidate[] = [];
    for (const f of state.facts) {
      if (f.kind !== "time_of_day" || f.predicate !== "implied_time" || f.sceneId == null) continue;
      const scene = scenes.get(f.sceneId);
      if (!scene) continue;
      const { bucket, from } = effectiveTime(state.scenes, scene.ordinal);
      const implied = f.objectValue as Bucket;
      if (!bucket || !INCOMPATIBLE[bucket]?.includes(implied)) continue;
      const via = from.id === scene.id ? "" : ` (scene ${scene.number} is ${scene.timeOfDay}, continuing scene ${from.number})`;
      out.push({
        checkId: this.id,
        severity: "medium",
        title: `Scene ${scene.number} is set at ${bucket}, but the scene suggests ${implied}`,
        explanation: `The heading places scene ${scene.number} at ${from.timeOfDay}${via}, while ${quote(f, scene)} suggests ${implied}.`,
        evidence: [`Heading: "${scene.heading}"${via}`, `In the scene: ${quote(f, scene)} — suggests ${implied}.`].join("\n"),
        factIds: [f.id],
        sceneNumbers: [scene.number],
        signatureParts: [scene.number, bucket, implied, f.sourceSnippet.toLowerCase()],
      });
    }
    return out;
  },
};
