/**
 * Placeholder rate card for a rough budget. These are NOT real rates: they
 * exist so the budget shows its structure and its drivers. Override any of
 * them with BUDGET_RATES (a JSON object of the same keys), e.g.
 * BUDGET_RATES='{"crewDay": 9000, "currency": "INR"}'.
 */

export interface RateCard {
  currency: string;
  /** Whole shooting crew, per shoot day. */
  crewDay: number;
  /** Camera, grip and electric package, per shoot day. */
  equipmentDay: number;
  /** Extra lighting and generator for a night shoot day. */
  nightPremiumDay: number;
  leadDay: number;
  supportingDay: number;
  dayPlayerDay: number;
  /** Location fee per set per shoot day it is used. */
  locationDay: number;
  /** Permit per set (one-off). */
  permitPerSet: number;
  studioTeacherDay: number;
  stuntCoordinatorDay: number;
  armorerDay: number;
  sfxDay: number;
  fireSafetyDay: number;
  waterSafetyDay: number;
  wranglerDay: number;
  pictureVehicleDay: number;
  sfxMakeupDay: number;
  intimacyCoordinatorDay: number;
  equipmentSpecialDay: number;
  extraPerDay: number;
  /** Assumed background count when the script gives none. */
  extrasPerScene: number;
  vfxPerShot: number;
  /** Post-production per finished minute. */
  postPerMinute: number;
  contingencyPct: number;
}

const FEATURE: RateCard = {
  currency: "USD",
  crewDay: 18000,
  equipmentDay: 4500,
  nightPremiumDay: 3000,
  leadDay: 2500,
  supportingDay: 1200,
  dayPlayerDay: 600,
  locationDay: 2500,
  permitPerSet: 800,
  studioTeacherDay: 450,
  stuntCoordinatorDay: 1500,
  armorerDay: 900,
  sfxDay: 2500,
  fireSafetyDay: 900,
  waterSafetyDay: 1500,
  wranglerDay: 1200,
  pictureVehicleDay: 500,
  sfxMakeupDay: 800,
  intimacyCoordinatorDay: 1000,
  equipmentSpecialDay: 3000,
  extraPerDay: 180,
  extrasPerScene: 10,
  vfxPerShot: 2500,
  postPerMinute: 2500,
  contingencyPct: 10,
};

const SHORT: RateCard = {
  ...FEATURE,
  crewDay: 4000,
  equipmentDay: 1500,
  nightPremiumDay: 800,
  leadDay: 600,
  supportingDay: 350,
  dayPlayerDay: 200,
  locationDay: 600,
  permitPerSet: 250,
  sfxDay: 800,
  wranglerDay: 500,
  pictureVehicleDay: 200,
  extraPerDay: 80,
  extrasPerScene: 6,
  vfxPerShot: 800,
  postPerMinute: 600,
};

export function rateCard(shortForm: boolean, env: Record<string, string | undefined> = process.env): { rates: RateCard; tier: "short" | "feature"; overridden: string[] } {
  const base = shortForm ? SHORT : FEATURE;
  let overrides: Partial<RateCard> = {};
  if (env.BUDGET_RATES) {
    try {
      overrides = JSON.parse(env.BUDGET_RATES) as Partial<RateCard>;
    } catch {
      throw new Error("BUDGET_RATES is not valid JSON");
    }
  }
  const known = Object.keys(base);
  const overridden = Object.keys(overrides).filter((k) => known.includes(k));
  return { rates: { ...base, ...Object.fromEntries(overridden.map((k) => [k, overrides[k as keyof RateCard]])) }, tier: shortForm ? "short" : "feature", overridden };
}
