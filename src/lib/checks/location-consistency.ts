import { cite, nameOf, quote, sceneIndex, type FactInfo, type FindingDraft, type JudgeCandidate, type JudgedCheck, type SceneInfo } from "./types";

/**
 * Deterministic: a script location that is not on the location sheet, or whose
 * INT/EXT disagrees with it. Judged: the same location described in
 * incompatible ways by two scenes, or by a scene and the sheet notes.
 */
export const locationConsistency: JudgedCheck = {
  id: "location_consistency",
  title: "Location described inconsistently",
  kind: "llm_judge",
  question:
    "These descriptions are of the same place. Do they contradict each other physically (different floor, size, layout, or condition that could not change in the story time between them)? Different details that can both be true are not a conflict.",
  deterministic(state) {
    const sheet = new Map<number, FactInfo>();
    for (const f of state.facts) if (f.predicate === "sheet_location" && f.subjectEntityId != null) sheet.set(f.subjectEntityId, f);
    if (sheet.size === 0) return []; // no location sheet loaded: nothing to compare against

    const out: FindingDraft[] = [];
    const reported = new Set<number>();
    for (const scene of state.scenes) {
      const loc = scene.locationEntityId;
      if (loc == null) continue;
      const heading = state.facts.find((f) => f.sceneId === scene.id && f.predicate === "scene_location");
      if (!heading) continue;
      const row = sheet.get(loc);
      const name = nameOf(state, loc);
      if (!row) {
        if (reported.has(loc)) continue;
        reported.add(loc);
        out.push({
          checkId: this.id,
          severity: "medium",
          title: `${name} (scene ${scene.number}) is not on the location sheet`,
          explanation: `Scene ${scene.number} is set at ${name} (${cite(heading)}), but no row on the location sheet has that name or alias.`,
          factIds: [heading.id],
          sceneNumbers: [scene.number],
          signatureParts: [name, "not_on_sheet"],
        });
        continue;
      }
      const sheetIntExt = String(row.attrs.intExt ?? "");
      const sceneIntExt = String(heading.attrs.intExt ?? "");
      const compatible = !sheetIntExt || sheetIntExt === "INT/EXT" || sceneIntExt === "INT/EXT" || sheetIntExt === sceneIntExt;
      if (!compatible) {
        out.push({
          checkId: this.id,
          severity: "low",
          title: `Scene ${scene.number} is ${sceneIntExt} at ${name}; the location sheet says ${sheetIntExt}`,
          explanation: `The heading of scene ${scene.number} (${cite(heading)}) is ${sceneIntExt}, while the location sheet lists ${name} as ${sheetIntExt} (${cite(row)}).`,
          factIds: [heading.id, row.id],
          sceneNumbers: [scene.number],
          signatureParts: [name, scene.number, "int_ext", sceneIntExt, sheetIntExt],
        });
      }
    }
    return out;
  },
  candidates(state) {
    const scenes = sceneIndex(state);
    const byLoc = new Map<number, { scene: SceneInfo; facts: FactInfo[] }[]>();
    const sheetNotes = new Map<number, FactInfo>();
    for (const f of state.facts) {
      if (f.subjectEntityId == null) continue;
      if (f.predicate === "sheet_location") sheetNotes.set(f.subjectEntityId, f);
      if (f.predicate !== "location_detail" || f.sceneId == null) continue;
      const scene = scenes.get(f.sceneId);
      if (!scene) continue;
      const list = byLoc.get(f.subjectEntityId) ?? [];
      const entry = list.find((e) => e.scene.id === scene.id);
      if (entry) entry.facts.push(f);
      else list.push({ scene, facts: [f] });
      byLoc.set(f.subjectEntityId, list);
    }

    const out: JudgeCandidate[] = [];
    for (const [loc, entries] of byLoc) {
      entries.sort((a, b) => a.scene.ordinal - b.scene.ordinal);
      const name = nameOf(state, loc);
      const describe = (e: { scene: SceneInfo; facts: FactInfo[] }) => e.facts.map((f) => quote(f, e.scene)).join("\n");
      const notes = sheetNotes.get(loc);
      entries.forEach((e, i) => {
        if (notes) {
          out.push({
            checkId: this.id,
            severity: "medium",
            title: `${name}: scene ${e.scene.number} vs the location sheet`,
            explanation: `Scene ${e.scene.number} describes ${name} as ${e.facts.map((f) => `"${f.objectValue}"`).join(", ")} (${cite(e.facts[0])}), while the location sheet notes say "${notes.objectValue}" (${cite(notes)}).`,
            evidence: `Location: ${name}\nLocation sheet notes (${cite(notes)}): "${notes.objectValue}"\nScene description:\n${describe(e)}`,
            factIds: [notes.id, ...e.facts.map((f) => f.id)],
            sceneNumbers: [e.scene.number],
            signatureParts: [name, "sheet", e.scene.number],
          });
        }
        const prev = entries[i - 1];
        if (prev) {
          out.push({
            checkId: this.id,
            severity: "medium",
            title: `${name} is described differently in scenes ${prev.scene.number} and ${e.scene.number}`,
            explanation: `Scene ${prev.scene.number} describes ${name} as ${prev.facts.map((f) => `"${f.objectValue}"`).join(", ")} (${cite(prev.facts[0])}); scene ${e.scene.number} describes it as ${e.facts.map((f) => `"${f.objectValue}"`).join(", ")} (${cite(e.facts[0])}).`,
            evidence: `Location: ${name}\nEarlier:\n${describe(prev)}\nLater:\n${describe(e)}`,
            factIds: [...prev.facts.map((f) => f.id), ...e.facts.map((f) => f.id)],
            sceneNumbers: [prev.scene.number, e.scene.number],
            signatureParts: [name, prev.scene.number, e.scene.number],
          });
        }
      });
    }
    return out;
  },
};
