/**
 * Stage 4 — Breakdown. Per scene: cast, wardrobe, props and department
 * elements, with page eighths. Then department alerts, each citing the lines
 * that triggered it. Code only: it reads the story graph built by the
 * continuity stage and the parsed script.
 */
import { CATEGORY_RULES, isExterior, isMagicHour, isMinor, isNight, MAGIC_HOUR, NIGHT_EXTERIOR, statedAges, type DeptRule } from "../breakdown/rules";
import { loadState } from "../checks/state";
import { nameOf } from "../checks/types";
import { BREAKDOWN_CATEGORIES, type BreakdownCategory } from "../extract/schema";
import { parseFountain } from "../fountain";
import { formatEighths, sceneEighths } from "../intake/pages";
import type { Cite, StageDef } from "./types";

export interface BreakdownElement {
  category: BreakdownCategory;
  item: string;
  detail: string | null;
  cite: Cite;
}

export interface BreakdownScene {
  number: string;
  heading: string;
  intExt: string;
  time: string;
  eighths: number;
  pages: string;
  storyDay: number | null;
  cast: string[];
  wardrobe: { character: string; garment: string }[];
  props: string[];
  elements: BreakdownElement[];
}

export interface DeptAlert {
  department: string;
  severity: "high" | "medium" | "low";
  title: string;
  needs: string;
  scenes: string[];
  items: string[];
  cites: Cite[];
}

export interface BreakdownReport {
  modelRead: boolean;
  scenes: BreakdownScene[];
  cast: { name: string; scenes: string[]; eighths: number }[];
  counts: Partial<Record<BreakdownCategory, number>>;
  alerts: DeptAlert[];
}

const MAX_CITES = 6;

export const breakdownStage: StageDef<BreakdownReport> = {
  id: "breakdown",
  title: "Breakdown",
  summary: "Cast, wardrobe, props and department elements per scene, with alerts for minors, stunts, weapons, fire, water, animals, vehicles and night work.",
  async step({ ctx, run }) {
    if (!run.scriptText || !run.scriptDocId) throw new Error("the continuity stage has not stored the script yet");
    const state = await loadState(ctx.db, run.scriptDocId);
    const parsed = parseFountain(run.scriptText);
    const docName = state.facts.find((f) => f.sourceDocId === run.scriptDocId)?.sourceDocName ?? run.sourceName;
    const byNumber = new Map(state.scenes.map((s) => [s.number, s]));

    const scenes: BreakdownScene[] = parsed.scenes.map((p) => {
      const info = byNumber.get(p.number);
      const facts = info ? state.facts.filter((f) => f.sceneId === info.id) : [];
      // Anyone who speaks, is present, wears something or holds something in the scene is in its cast.
      const cast = [...new Set(facts.filter((f) => ["appears_in", "wears", "has_prop"].includes(f.kind) && f.subjectEntityId != null).map((f) => nameOf(state, f.subjectEntityId)))];
      const wardrobe = facts.filter((f) => f.kind === "wears").map((f) => ({ character: nameOf(state, f.subjectEntityId), garment: f.objectValue }));
      const props = [...new Set(facts.filter((f) => f.kind === "prop_state" && f.predicate !== "mentioned").map((f) => nameOf(state, f.subjectEntityId)))];
      const elements: BreakdownElement[] = facts
        .filter((f) => f.kind === "breakdown_element")
        .map((f) => ({
          category: f.predicate as BreakdownCategory,
          item: f.objectValue,
          detail: (f.attrs.detail as string | null) ?? null,
          cite: { docName: f.sourceDocName, line: f.sourceLine, snippet: f.sourceSnippet, sceneNumber: p.number },
        }));
      // Minors are decided by code from stated ages, in addition to anything the model tagged.
      for (const a of statedAges(p).filter(isMinor)) {
        if (!elements.some((e) => e.category === "minor" && e.cite.line === a.line)) {
          elements.push({ category: "minor", item: `${a.name} (${a.age})`, detail: "age stated in the script", cite: { docName, line: a.line, snippet: a.snippet, sceneNumber: p.number } });
        }
      }
      // A character introduced with an age ("YOUNG MAYA (8)") is present, even if silent.
      for (const a of statedAges(p)) {
        const n = a.name.toUpperCase();
        if (!cast.some((c) => c.toUpperCase() === n || c.toUpperCase().endsWith(` ${n}`) || n.endsWith(` ${c.toUpperCase()}`))) cast.push(a.name);
      }
      const eighths = sceneEighths(p);
      return { number: p.number, heading: p.heading, intExt: p.intExt, time: p.timeOfDay, eighths, pages: formatEighths(eighths), storyDay: info?.storyDay ?? null, cast, wardrobe, props, elements };
    });

    // ---- alerts ---------------------------------------------------------------------
    const alerts: DeptAlert[] = [];
    const add = (rule: DeptRule, hits: { scene: string; item: string; cite: Cite }[], extra?: Partial<DeptAlert>) => {
      if (!hits.length) return;
      alerts.push({
        department: rule.department,
        severity: rule.severity,
        title: rule.title,
        needs: rule.needs,
        scenes: [...new Set(hits.map((h) => h.scene))],
        items: [...new Set(hits.map((h) => h.item))],
        cites: hits.slice(0, MAX_CITES).map((h) => h.cite),
        ...extra,
      });
    };
    for (const cat of BREAKDOWN_CATEGORIES) {
      add(
        CATEGORY_RULES[cat],
        scenes.flatMap((s) => s.elements.filter((e) => e.category === cat).map((e) => ({ scene: s.number, item: e.item, cite: e.cite }))),
      );
    }
    const headingCite = (s: BreakdownScene): Cite => {
      const p = parsed.scenes.find((x) => x.number === s.number)!;
      return { docName, line: p.startLine, snippet: p.heading, sceneNumber: s.number };
    };
    add(NIGHT_EXTERIOR, scenes.filter((s) => isExterior(s.intExt) && isNight(s.time)).map((s) => ({ scene: s.number, item: s.heading, cite: headingCite(s) })));
    add(MAGIC_HOUR, scenes.filter((s) => isExterior(s.intExt) && isMagicHour(s.time)).map((s) => ({ scene: s.number, item: s.heading, cite: headingCite(s) })));
    // A child in a night scene is its own, more serious, problem.
    const minorsAtNight = scenes.filter((s) => isNight(s.time) && s.elements.some((e) => e.category === "minor"));
    add(
      { department: "Production (child welfare)", severity: "high", title: "Child performer at night", needs: "Child work-hour rules usually forbid or limit night work: check the permit, or shoot day-for-night." },
      minorsAtNight.flatMap((s) => s.elements.filter((e) => e.category === "minor").map((e) => ({ scene: s.number, item: e.item, cite: e.cite }))),
    );

    const rank = { high: 0, medium: 1, low: 2 };
    alerts.sort((a, b) => rank[a.severity] - rank[b.severity] || b.scenes.length - a.scenes.length);

    const castMap = new Map<string, { scenes: string[]; eighths: number }>();
    for (const s of scenes) {
      for (const c of s.cast) {
        const e = castMap.get(c) ?? { scenes: [], eighths: 0 };
        e.scenes.push(s.number);
        e.eighths += s.eighths;
        castMap.set(c, e);
      }
    }
    const counts: BreakdownReport["counts"] = {};
    for (const s of scenes) for (const e of s.elements) counts[e.category] = (counts[e.category] ?? 0) + 1;

    return {
      done: true,
      report: {
        modelRead: !!ctx.gateway,
        scenes,
        cast: [...castMap].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.scenes.length - a.scenes.length || a.name.localeCompare(b.name)),
        counts,
        alerts,
      },
    };
  },
};
