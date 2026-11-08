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
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80,
};

function ageValue(token: string): number | undefined {
  if (/^\d{1,3}$/.test(token)) return Number(token);
  const parts = token.toLowerCase().split("-");
  const total = parts.reduce((n, p) => n + (NUMBER_WORDS[p] ?? NaN), 0);
  return Number.isFinite(total) ? total : undefined;
}

export function statedAges(scene: Pick<ParsedScene, "elements">): StatedAge[] {
  const out: StatedAge[] = [];
  const push = (e: { text: string; line: number }, index: number, name: string, age: number, approximate: boolean, snippet: string) => {
    const lineOffset = e.text.slice(0, index).split("\n").length - 1;
    if (!out.some((a) => a.name === name && a.line === e.line + lineOffset)) out.push({ name, age, approximate, line: e.line + lineOffset, snippet });
  };
  for (const e of scene.elements) {
    if (e.type !== "action") continue;
    // The screenplay convention: "YOUNG MAYA (8)", "INSPECTOR OKAFOR (50s)".
    for (const m of e.text.matchAll(/\b([A-Z][A-Z'.-]*(?: [A-Z][A-Z'.-]*)*) \((\d{1,2})(s)?\)/g)) push(e, m.index!, m[1], Number(m[2]), !!m[3], m[0]);
    // Prose: "SAMI, a ten-year-old boy", "KIRAN, 12-year-old".
    // Case-sensitive on purpose: a character is written in capitals on first appearance.
    for (const m of e.text.matchAll(/\b([A-Z][A-Z'-]+(?: [A-Z][A-Z'-]+)*),? (?:an? |the )?([a-z]+(?:-[a-z]+)?|\d{1,2})[- ][Yy]ear[- ]old\b/g)) {
      const age = ageValue(m[2]);
      if (age != null) push(e, m.index!, m[1], age, false, m[0]);
    }
    // Decades in prose: "ELENA, in her forties".
    for (const m of e.text.matchAll(/\b([A-Z][A-Z'.-]+(?: [A-Z][A-Z'.-]+)*),? [^.]{0,40}?\bin (?:her|his|their) (twenties|thirties|forties|fifties|sixties|seventies|eighties)\b/g)) {
      const age = NUMBER_WORDS[m[2].replace(/ies$/, "y")]; // forties -> forty
      if (age != null) push(e, m.index!, m[1], age, true, m[0].slice(0, 120));
    }
  }
  return out;
}

export const isMinor = (a: StatedAge) => !a.approximate && a.age < 18;

/**
 * Cast names that belong to minors, from the breakdown's minor elements
 * ("KIRAN", "YOUNG MAYA (8)"). A minor is identified once (where the age is
 * stated) but works every scene their name appears in.
 */
export function minorMatcher(minorItems: string[]): (castName: string) => boolean {
  const names = [...new Set(minorItems.map((i) => i.replace(/\s*\(\d+\)\s*$/, "").trim().toUpperCase()).filter(Boolean))];
  return (castName: string) => {
    const c = castName.toUpperCase();
    return names.some((m) => c === m || c.endsWith(` ${m}`) || m.endsWith(` ${c}`));
  };
}
