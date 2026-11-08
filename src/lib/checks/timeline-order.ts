import { cite, type Check, type FactInfo, type FindingDraft } from "./types";

/** An explicitly stated story day runs backwards in scene order, with no flashback marker. */
export const timelineOrder: Check = {
  id: "timeline_order",
  title: "Story days go backwards",
  kind: "deterministic",
  run(state) {
    const dayFacts = new Map<number, FactInfo>();
    for (const f of state.facts) if (f.kind === "story_day" && f.sceneId != null) dayFacts.set(f.sceneId, f);

    const findings: FindingDraft[] = [];
    let latest: { day: number; scene: string; fact: FactInfo } | undefined;
    for (const scene of state.scenes) {
      if (scene.isFlashback || scene.storyDay == null) continue;
      const fact = dayFacts.get(scene.id);
      if (!fact) continue;
      if (latest && scene.dayBasis === "explicit" && scene.storyDay < latest.day) {
        findings.push({
          checkId: this.id,
          severity: "high",
          title: `Scene ${scene.number} is day ${scene.storyDay}, after scene ${latest.scene} on day ${latest.day}`,
          explanation:
            `Scene ${scene.number} is marked as story day ${scene.storyDay} (${cite(fact)}), but it comes after scene ${latest.scene}, ` +
            `which is already day ${latest.day} (${cite(latest.fact)}). The scene has no flashback marker.`,
          factIds: [latest.fact.id, fact.id],
          sceneNumbers: [latest.scene, scene.number],
          signatureParts: [latest.scene, String(latest.day), scene.number, String(scene.storyDay)],
        });
        continue; // keep the later day as the high-water mark
      }
      if (!latest || scene.storyDay >= latest.day) latest = { day: scene.storyDay, scene: scene.number, fact };
    }
    return findings;
  },
};
