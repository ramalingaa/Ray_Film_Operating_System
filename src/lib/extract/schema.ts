/**
 * What the extraction agent returns for one scene. Kept deliberately flat and
 * constraint-light so every provider's structured-output mode can follow it;
 * tighter checks (line ranges, snippet verification, word limits) run in code.
 */
import { z } from "zod";

const source = {
  source_line: z.number().int().describe("Line number (from the left margin) the item is based on"),
  source_snippet: z.string().describe("Exact words copied from that line, at most 25 words"),
};

export const GARMENT_STATES = ["normal", "torn", "wet", "bloody", "dirty", "scorched", "other"] as const;
export const PROP_ACTIONS = ["introduced", "used", "mentioned", "destroyed", "lost", "repaired", "replaced"] as const;
export const BREAKDOWN_CATEGORIES = [
  "extras",
  "vehicle",
  "animal",
  "stunt",
  "weapon",
  "sfx",
  "fire",
  "water",
  "vfx",
  "makeup",
  "equipment",
  "intimacy",
  "minor",
] as const;
export type BreakdownCategory = (typeof BREAKDOWN_CATEGORIES)[number];

export const DAY_RELATIONS = ["explicit", "same_day", "next_day", "later", "earlier", "unknown"] as const;

export const SceneExtractionSchema = z.object({
  characters: z.array(
    z.object({
      name: z.string().describe("Name as written in the script, e.g. MAYA REYES or MAYA"),
      speaking: z.boolean(),
      ...source,
    }),
  ),
  setting: z.object({
    location: z.string(),
    int_ext: z.enum(["INT", "EXT", "INT/EXT", "UNKNOWN"]),
    time_of_day: z.string().describe("As stated in the heading, e.g. NIGHT, CONTINUOUS"),
    ...source,
  }),
  location_details: z.array(
    z.object({
      detail: z.string().describe("A physical fact about the place: floor, size, layout, condition, fixtures"),
      ...source,
    }),
  ).describe("Concrete descriptions of the location in this scene. Empty if none."),
  time_of_day_evidence: z.array(
    z.object({
      implies: z.enum(["dawn", "morning", "day", "evening", "dusk", "night"]),
      ...source,
    }),
  ).describe("Action or dialogue that implies a time of day (sunlight, 'good morning', streetlights). Empty if none."),
  story_day: z.object({
    relation: z.enum(DAY_RELATIONS),
    day: z.number().int().nullable().describe("Only when the text states the day number explicitly"),
    reasoning: z.string(),
    ...source,
  }),
  costumes: z.array(
    z.object({
      character: z.string(),
      garment: z.string().describe("One garment per entry, with its colour/material if stated, e.g. 'green raincoat'"),
      state: z.enum(GARMENT_STATES),
      state_detail: z.string().nullable(),
      changes_into: z.boolean().describe("True if the character changes into this garment during the scene"),
      ...source,
    }),
  ),
  props: z.array(
    z.object({
      name: z.string().describe("Specific name, e.g. 'brass key', 'leather-bound ledger'"),
      action: z.enum(PROP_ACTIONS),
      holder: z.string().nullable().describe("Character holding or using it, if any"),
      state: z.string().nullable().describe("Physical state if stated, e.g. 'burning', 'cracked'"),
      fixed_in_place: z.boolean().describe("True for objects that cannot travel with a character (a piano, a mural)"),
      ...source,
    }),
  ),
  knowledge: z.array(
    z.object({
      character: z.string(),
      kind: z.enum(["learns", "references"]),
      fact: z.string().describe("The piece of information, as a short plain statement"),
      ...source,
    }),
  ),
  relationships: z.array(
    z.object({
      a: z.string(),
      b: z.string(),
      relation: z.string().describe("e.g. siblings, father of, employer of"),
      ...source,
    }),
  ),
  breakdown: z
    .array(
      z.object({
        category: z.enum(BREAKDOWN_CATEGORIES),
        item: z.string().describe("Short name, e.g. 'hatchback', 'fistfight', 'lit lantern', '20 dock workers'"),
        detail: z.string().nullable().describe("Anything a department needs: count, action, condition"),
        ...source,
      }),
    )
    .describe("Things a production department must prepare for this scene. Empty if none."),
});

export type SceneExtraction = z.infer<typeof SceneExtractionSchema>;
