/**
 * Stage 7 — Budget. A rough top sheet built from the schedule and breakdown
 * with a placeholder rate card. Every line shows quantity × rate and the
 * scenes or days it comes from, so the drivers are visible and editable.
 * Code only.
 */
import { minorMatcher } from "../breakdown/rules";
import { rateCard, type RateCard } from "../budget/rates";
import type { BreakdownCategory } from "../extract/schema";
import type { BreakdownReport } from "./breakdown";
import type { IntakeReport } from "./intake";
import type { LocationsReport } from "./locations";
import { stageReport } from "./reports";
import type { ScheduleReport } from "./schedule";
import type { StageDef } from "./types";

export interface BudgetLine {
  section: "Cast" | "Crew and equipment" | "Locations" | "Departments" | "Post-production" | "Contingency";
  label: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  basis: string;
}

export interface BudgetReport {
  currency: string;
  tier: "short" | "feature";
  overridden: string[];
  lines: BudgetLine[];
  sections: { section: BudgetLine["section"]; amount: number }[];
  total: number;
  drivers: BudgetLine[];
  assumptions: string[];
}

const DEPT_LINES: { category: BreakdownCategory; label: string; rate: keyof RateCard }[] = [
  { category: "minor", label: "Studio teacher (child performers)", rate: "studioTeacherDay" },
  { category: "stunt", label: "Stunt coordinator", rate: "stuntCoordinatorDay" },
  { category: "weapon", label: "Armorer", rate: "armorerDay" },
  { category: "sfx", label: "Special effects crew", rate: "sfxDay" },
  { category: "fire", label: "Fire safety officer", rate: "fireSafetyDay" },
  { category: "water", label: "Water safety", rate: "waterSafetyDay" },
  { category: "animal", label: "Animal wrangler", rate: "wranglerDay" },
  { category: "vehicle", label: "Picture vehicles", rate: "pictureVehicleDay" },
  { category: "makeup", label: "Special effects makeup", rate: "sfxMakeupDay" },
  { category: "intimacy", label: "Intimacy coordinator", rate: "intimacyCoordinatorDay" },
  { category: "equipment", label: "Special equipment", rate: "equipmentSpecialDay" },
];

export const budgetStage: StageDef<BudgetReport> = {
  id: "budget",
  title: "Budget",
  summary: "A rough top sheet from the schedule and breakdown, every line showing quantity × rate and where it comes from.",
  async step({ ctx, run }) {
    const [intake, breakdown, locations, schedule] = await Promise.all([
      stageReport<IntakeReport>(ctx.db, run.id, "intake"),
      stageReport<BreakdownReport>(ctx.db, run.id, "breakdown"),
      stageReport<LocationsReport>(ctx.db, run.id, "locations"),
      stageReport<ScheduleReport>(ctx.db, run.id, "schedule"),
    ]);
    const shortForm = intake.totalEighths / 8 < 30;
    const { rates: r, tier, overridden } = rateCard(shortForm);
    const lines: BudgetLine[] = [];
    const add = (l: Omit<BudgetLine, "amount">) => {
      if (l.qty > 0) lines.push({ ...l, amount: Math.round(l.qty * l.rate) });
    };
    const shootDays = schedule.totals.shootDays;
    const dayOf = new Map(schedule.days.flatMap((d) => d.strips.map((s) => [s.scene, d.day] as const)));
    const daysFor = (scenes: string[]) => [...new Set(scenes.map((n) => dayOf.get(n)).filter((d): d is number => d != null))];

    // ---- cast: paid from first to last work day (holds included) --------------------
    const totalScenes = breakdown.scenes.length;
    for (const c of schedule.dood) {
      const scenes = breakdown.cast.find((x) => x.name === c.name)?.scenes.length ?? 0;
      const paidDays = c.last - c.first + 1;
      const role = scenes / Math.max(1, totalScenes) >= 0.3 ? "lead" : scenes >= 2 ? "supporting" : "day player";
      const rate = role === "lead" ? r.leadDay : role === "supporting" ? r.supportingDay : r.dayPlayerDay;
      add({ section: "Cast", label: `${c.name} (${role})`, qty: paidDays, unit: "day", rate, basis: `works days ${c.workDays.join(", ")}${c.holdDays.length ? `; holds ${c.holdDays.join(", ")}` : ""}` });
    }
    const extrasScenes = breakdown.scenes.filter((s) => s.elements.some((e) => e.category === "extras"));
    add({ section: "Cast", label: "Background extras", qty: extrasScenes.length * r.extrasPerScene, unit: "person-day", rate: r.extraPerDay, basis: `${r.extrasPerScene} per scene, scenes ${extrasScenes.map((s) => s.number).join(", ")}` });

    // ---- crew and equipment ---------------------------------------------------------
    add({ section: "Crew and equipment", label: "Shooting crew", qty: shootDays, unit: "day", rate: r.crewDay, basis: `${shootDays} shoot days from the schedule` });
    add({ section: "Crew and equipment", label: "Camera, grip and electric package", qty: shootDays, unit: "day", rate: r.equipmentDay, basis: "every shoot day" });
    add({ section: "Crew and equipment", label: "Night lighting and generator", qty: schedule.totals.nightDays, unit: "day", rate: r.nightPremiumDay, basis: `${schedule.totals.nightDays} night shoot days` });

    // ---- locations ------------------------------------------------------------------
    for (const s of locations.sets) {
      add({ section: "Locations", label: `${s.name} fee`, qty: daysFor(s.scenes).length, unit: "day", rate: r.locationDay, basis: `scenes ${s.scenes.join(", ")}` });
    }
    add({ section: "Locations", label: "Permits", qty: locations.sets.length, unit: "set", rate: r.permitPerSet, basis: `${locations.sets.length} sets` });

    // ---- departments from the breakdown ---------------------------------------------
    const isMinor = minorMatcher(breakdown.scenes.flatMap((s) => s.elements.filter((e) => e.category === "minor").map((e) => e.item)));
    for (const d of DEPT_LINES) {
      // A child needs the studio teacher on every scene they are in, not only where their age is stated.
      const scenes = breakdown.scenes
        .filter((s) => s.elements.some((e) => e.category === d.category) || (d.category === "minor" && s.cast.some(isMinor)))
        .map((s) => s.number);
      add({ section: "Departments", label: d.label, qty: daysFor(scenes).length, unit: "day", rate: r[d.rate] as number, basis: `scenes ${scenes.join(", ")}` });
    }
    const vfx = breakdown.scenes.flatMap((s) => s.elements.filter((e) => e.category === "vfx").map(() => s.number));
    add({ section: "Departments", label: "Visual effects shots", qty: vfx.length, unit: "shot", rate: r.vfxPerShot, basis: `one shot per tagged effect, scenes ${[...new Set(vfx)].join(", ")}` });

    // ---- post and contingency -------------------------------------------------------
    add({ section: "Post-production", label: "Edit, sound, colour and delivery", qty: Math.max(1, intake.runtimeMinutes), unit: "minute", rate: r.postPerMinute, basis: `~${intake.runtimeMinutes} minutes running time` });
    const subtotal = lines.reduce((n, l) => n + l.amount, 0);
    add({ section: "Contingency", label: `Contingency (${r.contingencyPct}%)`, qty: 1, unit: "lump", rate: Math.round((subtotal * r.contingencyPct) / 100), basis: "of everything above" });

    const order: BudgetLine["section"][] = ["Cast", "Crew and equipment", "Locations", "Departments", "Post-production", "Contingency"];
    const sections = order.map((section) => ({ section, amount: lines.filter((l) => l.section === section).reduce((n, l) => n + l.amount, 0) })).filter((s) => s.amount > 0);
    return {
      done: true,
      report: {
        currency: r.currency,
        tier,
        overridden,
        lines,
        sections,
        total: lines.reduce((n, l) => n + l.amount, 0),
        drivers: [...lines].filter((l) => l.section !== "Contingency").sort((a, b) => b.amount - a.amount).slice(0, 5),
        assumptions: [
          `Placeholder ${tier}-film rates, not quotes. Replace them with your own via BUDGET_RATES${overridden.length ? ` (overridden here: ${overridden.join(", ")})` : ""}.`,
          "Cast are paid from their first to their last work day, holding days included. Role is lead if in 30% or more of scenes, supporting if in two or more.",
          "Department costs are per shoot day on which their scenes are scheduled.",
          "Prep, wrap, travel, insurance, legal, music and marketing are not included.",
        ],
      },
    };
  },
};
