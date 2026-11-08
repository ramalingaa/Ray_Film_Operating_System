import { cite, nameOf, sceneIndex, type DeterministicCheck, type FactInfo, type FindingDraft, type SceneInfo } from "./types";

interface PropEvent {
  fact: FactInfo;
  scene: SceneInfo;
  action: string;
}

/**
 * Prop used before it is introduced, used after it is destroyed, or (for props
 * that cannot be carried) in two different locations on the same story day.
 * Flashback scenes are ignored: they legitimately show a prop's past.
 */
export const propLifecycle: DeterministicCheck = {
  id: "prop_lifecycle",
  title: "Prop lifecycle conflict",
  kind: "deterministic",
  run(state) {
    const scenes = sceneIndex(state);
    const byProp = new Map<number, PropEvent[]>();
    for (const f of state.facts) {
      if (f.kind !== "prop_state" || f.sceneId == null || f.subjectEntityId == null) continue;
      const scene = scenes.get(f.sceneId);
      if (!scene || scene.isFlashback) continue;
      const list = byProp.get(f.subjectEntityId) ?? [];
      list.push({ fact: f, scene, action: String(f.attrs.action ?? f.predicate) });
      byProp.set(f.subjectEntityId, list);
    }

    const findings: FindingDraft[] = [];
    for (const [propId, raw] of byProp) {
      const events = raw.sort((a, b) => a.scene.ordinal - b.scene.ordinal || a.fact.sourceLine - b.fact.sourceLine);
      const prop = nameOf(state, propId);

      // (a) used before introduced
      const firstUse = events.find((e) => e.action === "used");
      const intro = events.find((e) => e.action === "introduced");
      if (firstUse && intro && firstUse.scene.ordinal < intro.scene.ordinal) {
        findings.push({
          checkId: this.id,
          severity: "medium",
          title: `The ${prop.toLowerCase()} is used in scene ${firstUse.scene.number} before it is introduced in scene ${intro.scene.number}`,
          explanation: `Scene ${firstUse.scene.number} uses the ${prop.toLowerCase()} (${cite(firstUse.fact)}), but it is first introduced later, in scene ${intro.scene.number} (${cite(intro.fact)}).`,
          factIds: [firstUse.fact.id, intro.fact.id],
          sceneNumbers: [firstUse.scene.number, intro.scene.number],
          signatureParts: [prop, "before_intro", firstUse.scene.number, intro.scene.number],
        });
      }

      // (b) used after destroyed, unless repaired or replaced in between
      let destroyed: PropEvent | undefined;
      for (const e of events) {
        if (e.action === "destroyed") destroyed ??= e;
        else if (e.action === "repaired" || e.action === "replaced") destroyed = undefined;
        else if (destroyed && e.action === "used" && e.scene.ordinal > destroyed.scene.ordinal) {
          findings.push({
            checkId: this.id,
            severity: "high",
            title: `The ${prop.toLowerCase()} is used in scene ${e.scene.number} after it was destroyed in scene ${destroyed.scene.number}`,
            explanation: `Scene ${destroyed.scene.number} destroys the ${prop.toLowerCase()} (${cite(destroyed.fact)}). Scene ${e.scene.number} uses it again (${cite(e.fact)}) with no repair or replacement in between.`,
            factIds: [destroyed.fact.id, e.fact.id],
            sceneNumbers: [destroyed.scene.number, e.scene.number],
            signatureParts: [prop, "after_destroyed", destroyed.scene.number, e.scene.number],
          });
          break;
        }
      }

      // (c) a fixed-in-place prop in two locations on the same story day
      const fixed = events.filter((e) => e.fact.attrs.fixedInPlace === true && e.scene.storyDay != null && e.scene.locationEntityId != null);
      const byDay = new Map<number, PropEvent[]>();
      for (const e of fixed) byDay.set(e.scene.storyDay!, [...(byDay.get(e.scene.storyDay!) ?? []), e]);
      for (const [day, list] of byDay) {
        const first = list[0];
        const elsewhere = list.find((e) => e.scene.locationEntityId !== first.scene.locationEntityId);
        if (!elsewhere) continue;
        findings.push({
          checkId: this.id,
          severity: "medium",
          title: `The ${prop.toLowerCase()} is in two places on story day ${day}`,
          explanation:
            `The ${prop.toLowerCase()} cannot be moved, but on day ${day} it appears at ${nameOf(state, first.scene.locationEntityId)} in scene ${first.scene.number} (${cite(first.fact)}) ` +
            `and at ${nameOf(state, elsewhere.scene.locationEntityId)} in scene ${elsewhere.scene.number} (${cite(elsewhere.fact)}).`,
          factIds: [first.fact.id, elsewhere.fact.id],
          sceneNumbers: [first.scene.number, elsewhere.scene.number],
          signatureParts: [prop, "two_places", String(day), first.scene.number, elsewhere.scene.number],
        });
      }
    }
    return findings;
  },
};
