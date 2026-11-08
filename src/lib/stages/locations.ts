/**
 * Stage 5 — Locations. Groups scenes into sets (resolved location entities),
 * with what each set needs: interior/exterior, day/night, pages, and whether
 * it is on the location sheet. Code only.
 */
import { loadState } from "../checks/state";
import { parseFountain } from "../fountain";
import { formatEighths, sceneEighths } from "../intake/pages";
import { isExterior, isNight } from "../breakdown/rules";
import type { Cite, StageDef } from "./types";

export interface LocationSet {
  name: string;
  intExt: string[];
  times: string[];
  scenes: string[];
  eighths: number;
  pages: string;
  /** null when no location sheet was given. */
  onSheet: boolean | null;
  sheetCite?: Cite;
  firstCite: Cite;
}

export interface LocationFlag {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  cites: Cite[];
}

export interface LocationsReport {
  sets: LocationSet[];
  sheetGiven: boolean;
  split: { intEighths: number; extEighths: number; dayEighths: number; nightEighths: number };
  flags: LocationFlag[];
}

/** A set shorter than this (in eighths) that is used once is worth questioning. */
const ONE_OFF_EIGHTHS = 2;

export const locationsStage: StageDef<LocationsReport> = {
  id: "locations",
  title: "Locations",
  summary: "Every set with its interior/exterior and day/night needs, pages, sheet coverage, and one-off company moves.",
  async step({ ctx, run }) {
    if (!run.scriptText || !run.scriptDocId) throw new Error("the continuity stage has not stored the script yet");
    const state = await loadState(ctx.db, run.scriptDocId);
    const parsed = parseFountain(run.scriptText);
    const docName = state.facts.find((f) => f.sourceDocId === run.scriptDocId)?.sourceDocName ?? run.sourceName;
    const info = new Map(state.scenes.map((s) => [s.number, s]));
    const sheetFacts = state.facts.filter((f) => f.kind === "located_at" && f.predicate === "sheet_location");
    const sheetGiven = sheetFacts.length > 0;

    const sets = new Map<string, LocationSet>();
    const split = { intEighths: 0, extEighths: 0, dayEighths: 0, nightEighths: 0 };
    for (const p of parsed.scenes) {
      const s = info.get(p.number);
      const entityId = s?.locationEntityId ?? null;
      const name = entityId != null ? (state.entityNames.get(entityId) ?? p.location) : p.location;
      const key = entityId != null ? `e${entityId}` : `n${p.location}`;
      const eighths = sceneEighths(p);
      const cite: Cite = { docName, line: p.startLine, snippet: p.heading, sceneNumber: p.number };
      let set = sets.get(key);
      if (!set) {
        const sheet = entityId != null ? sheetFacts.find((f) => f.subjectEntityId === entityId) : undefined;
        set = {
          name,
          intExt: [],
          times: [],
          scenes: [],
          eighths: 0,
          pages: "",
          onSheet: sheetGiven ? !!sheet : null,
          sheetCite: sheet ? { docName: sheet.sourceDocName, line: sheet.sourceLine, snippet: sheet.sourceSnippet } : undefined,
          firstCite: cite,
        };
        sets.set(key, set);
      }
      if (!set.intExt.includes(p.intExt)) set.intExt.push(p.intExt);
      if (!set.times.includes(p.timeOfDay)) set.times.push(p.timeOfDay);
      set.scenes.push(p.number);
      set.eighths += eighths;
      if (isExterior(p.intExt)) split.extEighths += eighths;
      else split.intEighths += eighths;
      if (isNight(p.timeOfDay)) split.nightEighths += eighths;
      else split.dayEighths += eighths;
    }
    const list = [...sets.values()].map((s) => ({ ...s, pages: formatEighths(s.eighths) }));

    const flags: LocationFlag[] = [];
    for (const s of list) {
      if (s.onSheet === false) {
        flags.push({ severity: "medium", title: `${s.name} is not on the location sheet`, detail: `Used in scene${s.scenes.length > 1 ? "s" : ""} ${s.scenes.join(", ")}. It needs scouting, a contract and a permit.`, cites: [s.firstCite] });
      }
      const timesReal = s.times.filter((t) => !/CONTINUOUS|MOMENTS LATER|LATER|SAME/i.test(t));
      if (timesReal.some(isNight) && timesReal.some((t) => !isNight(t))) {
        flags.push({ severity: "low", title: `${s.name} is needed by day and by night`, detail: `Times: ${timesReal.join(", ")}. Plan two lighting setups, or separate shoot days.`, cites: [s.firstCite] });
      }
      if (s.scenes.length === 1 && s.eighths <= ONE_OFF_EIGHTHS) {
        flags.push({
          severity: "low",
          title: `${s.name} is used once, for ${s.pages} page${s.eighths > 8 ? "s" : ""}`,
          detail: "A whole company move for a short scene. Consider whether it could play at another location you are already using.",
          cites: [s.firstCite],
        });
      }
    }
    const rank = { high: 0, medium: 1, low: 2 };
    flags.sort((a, b) => rank[a.severity] - rank[b.severity]);
    return { done: true, report: { sets: list.sort((a, b) => b.eighths - a.eighths), sheetGiven, split, flags } };
  },
};
