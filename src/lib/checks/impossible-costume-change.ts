import { conflictWith, parseGarment, type Garment, type Slot } from "./garments";
import { cite, nameOf, sceneIndex, type DeterministicCheck, type FactInfo, type FindingDraft, type SceneInfo } from "./types";

/** Times of day that mean "no time has passed since the previous scene". */
export const NO_GAP_TIMES = new Set(["CONTINUOUS", "MOMENTS LATER", "SECONDS LATER", "SAME", "SAME TIME"]);

interface Worn {
  fact: FactInfo;
  garment: Garment;
  changesInto: boolean;
}

/** Costume differs between back-to-back scenes with no time for a change. */
export const impossibleCostumeChange: DeterministicCheck = {
  id: "impossible_costume_change",
  title: "Costume changes with no time to change",
  kind: "deterministic",
  run(state) {
    const scenes = sceneIndex(state);
    const findings: FindingDraft[] = [];

    // character → scene ordinal → garments worn there
    const worn = new Map<number, Map<number, Worn[]>>();
    for (const f of state.facts) {
      if (f.kind !== "wears" || f.predicate !== "wears" || f.sceneId == null || f.subjectEntityId == null) continue;
      const scene = scenes.get(f.sceneId);
      const garment = parseGarment(f.objectValue);
      if (!scene || !garment) continue;
      const byScene = worn.get(f.subjectEntityId) ?? new Map<number, Worn[]>();
      const list = byScene.get(scene.ordinal) ?? [];
      list.push({ fact: f, garment, changesInto: f.attrs.changesInto === true });
      byScene.set(scene.ordinal, list);
      worn.set(f.subjectEntityId, byScene);
    }

    const byOrdinal = new Map<number, SceneInfo>(state.scenes.map((s) => [s.ordinal, s]));
    for (const [charId, byScene] of worn) {
      for (const [ordinal, before] of byScene) {
        const next = byOrdinal.get(ordinal + 1);
        const after = byScene.get(ordinal + 1);
        const prev = byOrdinal.get(ordinal)!;
        if (!next || !after || !NO_GAP_TIMES.has(next.timeOfDay) || next.isFlashback || prev.isFlashback) continue;

        const slots = new Set<Slot>(after.map((w) => w.garment.slot));
        for (const slot of slots) {
          const afterItems = after.filter((w) => w.garment.slot === slot);
          if (afterItems.some((w) => w.changesInto)) continue; // changed on screen
          const beforeAll = before.filter((w) => w.garment.slot === slot);
          const changed = beforeAll.filter((w) => w.changesInto);
          const beforeItems = changed.length ? changed : beforeAll;
          if (!beforeItems.length) continue;

          for (const a of afterItems) {
            const conflict = conflictWith(a.garment, beforeItems.map((b) => b.garment));
            if (!conflict) continue;
            const b = beforeItems[0];
            const who = nameOf(state, charId);
            findings.push({
              checkId: this.id,
              severity: "high",
              title: `${who} changes from "${b.fact.objectValue}" to "${a.fact.objectValue}" between scenes ${prev.number} and ${next.number}`,
              explanation:
                `In scene ${prev.number} ${who} wears "${b.fact.objectValue}" (${cite(b.fact)}). ` +
                `Scene ${next.number} follows ${next.timeOfDay.toLowerCase()}, and ${who} wears "${a.fact.objectValue}" (${cite(a.fact)}). ` +
                `No change of clothes is shown in between.`,
              factIds: [b.fact.id, a.fact.id],
              sceneNumbers: [prev.number, next.number],
              signatureParts: [who, prev.number, next.number, slot],
            });
            break;
          }
        }
      }
    }
    return findings;
  },
};
