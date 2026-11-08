import { compareGarments, parseGarment } from "./garments";
import { NO_GAP_TIMES } from "./impossible-costume-change";
import { cite, nameOf, quote, sceneIndex, type FactInfo, type JudgeCandidate, type JudgedCheck, type SceneInfo } from "./types";

const DAMAGE = new Set(["torn", "wet", "bloody", "dirty", "scorched"]);

/**
 * A damaged garment (torn, wet, bloody, dirty, scorched) appears undamaged in
 * the character's next scene, on the same day, with no change of clothes.
 * Candidates only; the judge decides whether the later description actually
 * contradicts the damage or merely leaves it unmentioned.
 */
export const costumeStateCarryover: JudgedCheck = {
  id: "costume_state_carryover",
  title: "Costume damage disappears",
  kind: "llm_judge",
  question:
    "A garment was damaged in the earlier scene. Does the later scene describe the same garment in a way that contradicts that damage (for example 'immaculate', 'spotless', 'neatly pressed'), with no change of clothes or time to repair it? A garment that is just described without mentioning the damage is not a conflict.",
  candidates(state) {
    const scenes = sceneIndex(state);
    const byChar = new Map<number, { scene: SceneInfo; fact: FactInfo }[]>();
    for (const f of state.facts) {
      if (f.kind !== "wears" || f.predicate !== "wears" || f.sceneId == null || f.subjectEntityId == null) continue;
      const scene = scenes.get(f.sceneId);
      if (!scene || scene.isFlashback) continue;
      byChar.set(f.subjectEntityId, [...(byChar.get(f.subjectEntityId) ?? []), { scene, fact: f }]);
    }

    const out: JudgeCandidate[] = [];
    for (const [charId, worn] of byChar) {
      const ordinals = [...new Set(worn.map((w) => w.scene.ordinal))].sort((a, b) => a - b);
      for (let i = 0; i + 1 < ordinals.length; i++) {
        const before = worn.filter((w) => w.scene.ordinal === ordinals[i]);
        const after = worn.filter((w) => w.scene.ordinal === ordinals[i + 1]);
        const a = before[0].scene;
        const b = after[0].scene;
        const sameTime = NO_GAP_TIMES.has(b.timeOfDay) || (a.storyDay != null && a.storyDay === b.storyDay);
        if (!sameTime || after.some((w) => w.fact.attrs.changesInto === true)) continue;

        for (const damaged of before.filter((w) => DAMAGE.has(String(w.fact.attrs.state)))) {
          const g1 = parseGarment(damaged.fact.objectValue);
          if (!g1) continue;
          const later = after.find((w) => {
            const g2 = parseGarment(w.fact.objectValue);
            return g2 && compareGarments(g1, g2) === "compatible" && String(w.fact.attrs.state ?? "normal") === "normal";
          });
          if (!later) continue;
          const who = nameOf(state, charId);
          const state0 = String(damaged.fact.attrs.state);
          out.push({
            checkId: this.id,
            severity: "medium",
            title: `${who}'s ${g1.head} is ${state0} in scene ${a.number} but not in scene ${b.number}`,
            explanation: `In scene ${a.number} ${who}'s "${damaged.fact.objectValue}" is ${state0} (${cite(damaged.fact)}). In scene ${b.number}, later the same day, it is described as "${later.fact.objectValue}" (${cite(later.fact)}), with no change of clothes in between.`,
            evidence: [
              `Earlier: ${quote(damaged.fact, a)} — ${who}'s ${damaged.fact.objectValue} is ${state0}.`,
              `Later (${b.timeOfDay.toLowerCase()}, same story day): ${quote(later.fact, b)}`,
            ].join("\n"),
            factIds: [damaged.fact.id, later.fact.id],
            sceneNumbers: [a.number, b.number],
            signatureParts: [who, a.number, b.number, g1.head, state0],
          });
        }
      }
    }
    return out;
  },
};
