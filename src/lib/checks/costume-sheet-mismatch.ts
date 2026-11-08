import { conflictWith, parseGarment, splitCostume } from "./garments";
import { cite, nameOf, sceneIndex, type Check, type FindingDraft } from "./types";

/** Script says a character wears X in a scene; the costume sheet says Y for that scene or story day. */
export const costumeSheetMismatch: Check = {
  id: "costume_sheet_mismatch",
  title: "Script costume differs from the costume sheet",
  kind: "deterministic",
  run(state) {
    const scenes = sceneIndex(state);
    const sheetRows = state.facts.filter((f) => f.kind === "wears" && f.predicate === "sheet_costume");
    const findings: FindingDraft[] = [];

    for (const w of state.facts) {
      if (w.kind !== "wears" || w.predicate !== "wears" || w.sceneId == null) continue;
      const scene = scenes.get(w.sceneId);
      const item = parseGarment(w.objectValue);
      if (!scene || !item) continue;

      const rows = sheetRows.filter((r) => {
        if (r.subjectEntityId !== w.subjectEntityId) return false;
        const covered = (r.attrs.scenes as string[] | undefined) ?? [];
        if (covered.length) return covered.includes(scene.number);
        return r.storyDay != null && r.storyDay === scene.storyDay;
      });

      for (const row of rows) {
        const conflict = conflictWith(item, splitCostume(row.objectValue));
        if (!conflict) continue;
        const who = nameOf(state, w.subjectEntityId);
        findings.push({
          checkId: this.id,
          severity: conflict.relation === "different_garment" ? "high" : "medium",
          title: `${who}: "${w.objectValue}" in scene ${scene.number} vs costume sheet "${row.objectValue}"`,
          explanation:
            `Scene ${scene.number} describes ${who} in "${w.objectValue}" (${cite(w)}), ` +
            `while the costume sheet lists "${row.objectValue}" for ${row.attrs.scenes && (row.attrs.scenes as string[]).length ? `scenes ${(row.attrs.scenes as string[]).join(", ")}` : `story day ${row.storyDay}`} (${cite(row)}). ` +
            (conflict.relation === "different_colour" ? "The garment matches but the colours differ." : `These are different ${item.slot.replace("_", " ")} pieces.`),
          factIds: [w.id, row.id],
          sceneNumbers: [scene.number],
          signatureParts: [who, scene.number, item.head, [...item.colorFamilies].sort().join("+"), row.objectValue.toLowerCase()],
        });
      }
    }
    return findings;
  },
};
