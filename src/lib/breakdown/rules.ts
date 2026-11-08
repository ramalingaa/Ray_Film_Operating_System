/**
 * Department rules for the breakdown: which elements need which department,
 * how urgently, and what they usually need. Pure data and pure functions.
 */
import type { BreakdownCategory } from "../extract/schema";
import type { ParsedScene } from "../fountain";

export interface DeptRule {
  department: string;
  severity: "high" | "medium" | "low";
  title: string;
  needs: string;
}

export const CATEGORY_RULES: Record<BreakdownCategory, DeptRule> = {
  minor: { department: "Production (child welfare)", severity: "high", title: "Child performer", needs: "Work-hour limits, a studio teacher and a guardian on set, and a child performance permit where required." },
  stunt: { department: "Stunts", severity: "high", title: "Stunt or fight", needs: "A stunt coordinator, rehearsal time, doubles if needed, and a safety plan." },
  weapon: { department: "Props (armory)", severity: "high", title: "Weapon on set", needs: "A licensed armorer, safety briefing, and inert or replica weapons where possible." },
  fire: { department: "Special effects (safety)", severity: "high", title: "Fire or flame", needs: "A fire safety officer, an effects permit, and extinguishers on set." },
  intimacy: { department: "Intimacy coordination", severity: "high", title: "Intimate scene", needs: "An intimacy coordinator, a closed set, and consent riders." },
  water: { department: "Safety (marine)", severity: "medium", title: "Water work", needs: "Water safety crew, divers or boats as needed, and warm-up facilities." },
  animal: { department: "Animal wrangling", severity: "medium", title: "Animal", needs: "A wrangler, a welfare representative where required, and rest periods." },
  vehicle: { department: "Transport (picture vehicles)", severity: "medium", title: "Picture vehicle", needs: "The vehicle and a backup, a precision driver or process trailer if it moves with actors, and road permits." },
  sfx: { department: "Special effects", severity: "medium", title: "Practical effect", needs: "Effects crew and rigs (rain, smoke, breakaways), and reset time between takes." },
  vfx: { department: "Visual effects", severity: "medium", title: "Visual effect", needs: "A VFX supervisor on set, plates and reference, and post budget." },
  equipment: { department: "Camera and grip", severity: "medium", title: "Special equipment", needs: "Rental and qualified operators (crane, drone, underwater housing)." },
  makeup: { department: "Makeup (special effects)", severity: "low", title: "Special makeup", needs: "Prosthetics, blood or ageing, and continuity photos." },
  extras: { department: "Casting (background)", severity: "low", title: "Background extras", needs: "Background casting, wardrobe and holding area." },
};

export const NIGHT_EXTERIOR: DeptRule = {
  department: "Locations and lighting",
  severity: "medium",
  title: "Night exterior",
  needs: "A night lighting package, a night filming permit, and notice to neighbours.",
};

export const MAGIC_HOUR: DeptRule = {
  department: "Scheduling",
  severity: "medium",
  title: "Dawn or dusk exterior",
  needs: "A short natural-light window: plan the shot list to fit it, or plan to light it.",
};

export const isExterior = (intExt: string) => /EXT/i.test(intExt);
export const isNight = (time: string) => /NIGHT/i.test(time);
export const isMagicHour = (time: string) => /DAWN|DUSK|SUNSET|SUNRISE|TWILIGHT|MAGIC HOUR/i.test(time);

export interface StatedAge {
  name: string;
  age: number;
  /** True for "(30s)": a decade, not an exact age. */
  approximate: boolean;
  line: number;
  snippet: string;
}

/**
 * Ages stated in action lines the screenplay way: "YOUNG MAYA (8)",
 * "INSPECTOR OKAFOR (50s)". Code, not a model, decides who is a minor.
 */
export function statedAges(scene: Pick<ParsedScene, "elements">): StatedAge[] {
  const out: StatedAge[] = [];
  for (const e of scene.elements) {
    if (e.type !== "action") continue;
    for (const m of e.text.matchAll(/\b([A-Z][A-Z'.-]*(?: [A-Z][A-Z'.-]*)*) \((\d{1,2})(s)?\)/g)) {
      const lineOffset = e.text.slice(0, m.index).split("\n").length - 1;
      out.push({ name: m[1], age: Number(m[2]), approximate: !!m[3], line: e.line + lineOffset, snippet: m[0] });
    }
  }
  return out;
}

export const isMinor = (a: StatedAge) => !a.approximate && a.age < 18;
