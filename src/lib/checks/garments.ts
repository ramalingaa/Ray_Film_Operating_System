/**
 * Deterministic garment comparison. Two descriptions conflict only when they
 * fill the same slot (outerwear, top, ...) with a different garment, or with
 * the same garment in clearly different colours. Anything we cannot classify
 * never conflicts: precision first.
 */

export type Slot = "outerwear" | "full_body" | "top" | "bottom" | "footwear" | "headwear" | "accessory";

const SLOTS: Record<Slot, string[]> = {
  outerwear: ["coat", "raincoat", "overcoat", "trenchcoat", "trench", "parka", "anorak", "jacket", "blazer", "cardigan", "cloak", "cape", "poncho", "windbreaker", "gilet", "peacoat", "mac", "duster", "oilskin"],
  full_body: ["suit", "tuxedo", "tux", "dress", "gown", "uniform", "jumpsuit", "overalls", "robe", "bathrobe", "kimono", "sari", "scrubs", "coveralls", "wetsuit", "pajamas", "pyjamas"],
  top: ["shirt", "blouse", "t-shirt", "tshirt", "tee", "sweater", "jumper", "pullover", "hoodie", "sweatshirt", "vest", "tank", "polo", "turtleneck", "camisole", "top"],
  bottom: ["jeans", "trousers", "pants", "slacks", "skirt", "shorts", "leggings", "chinos"],
  footwear: ["boots", "boot", "shoes", "shoe", "sneakers", "trainers", "heels", "sandals", "loafers", "slippers"],
  headwear: ["hat", "cap", "fedora", "beanie", "helmet", "bonnet", "beret", "bandana", "turban", "hijab"],
  accessory: ["scarf", "tie", "gloves", "glasses", "sunglasses", "belt", "necklace", "watch", "earrings", "bracelet", "badge"],
};

const SLOT_OF = new Map<string, Slot>(Object.entries(SLOTS).flatMap(([slot, words]) => words.map((w) => [w, slot as Slot])));

/** Words that name the same garment. */
const SYNONYMS: string[][] = [
  ["sweater", "jumper", "pullover"],
  ["trousers", "pants", "slacks"],
  ["sneakers", "trainers"],
  ["t-shirt", "tshirt", "tee"],
  ["hoodie", "sweatshirt"],
  ["tuxedo", "tux"],
  ["boots", "boot"],
  ["shoes", "shoe"],
  ["robe", "bathrobe"],
  ["pajamas", "pyjamas"],
  ["trenchcoat", "trench"],
  ["raincoat", "oilskin", "mac"],
];
const CANON = new Map<string, string>(SYNONYMS.flatMap((g) => g.map((w) => [w, g[0]])));

/** Colour words grouped into families; members of one family never conflict with each other. */
const COLOR_FAMILIES: Record<string, string[]> = {
  black: ["black", "jet", "ebony"],
  white: ["white", "ivory", "cream", "off-white"],
  grey: ["grey", "gray", "charcoal", "slate", "silver"],
  red: ["red", "crimson", "scarlet", "maroon", "burgundy", "wine"],
  blue: ["blue", "navy", "royal", "cobalt", "teal", "turquoise"],
  green: ["green", "olive", "emerald", "khaki-green", "forest"],
  yellow: ["yellow", "mustard", "gold", "golden"],
  orange: ["orange", "rust"],
  purple: ["purple", "violet", "lilac", "lavender", "plum"],
  pink: ["pink", "rose", "magenta", "fuchsia"],
  brown: ["brown", "tan", "beige", "camel", "khaki", "chocolate"],
};
const COLOR_FAMILY = new Map<string, string>(Object.entries(COLOR_FAMILIES).flatMap(([fam, ws]) => ws.map((w) => [w, fam])));

export interface Garment {
  text: string;
  head: string;
  slot: Slot;
  colorFamilies: Set<string>;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\- ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Classify one garment description, or undefined if no known garment word is present. */
export function parseGarment(text: string): Garment | undefined {
  const ts = tokens(text);
  let head: string | undefined;
  for (let i = ts.length - 1; i >= 0; i--) {
    if (SLOT_OF.has(ts[i])) {
      head = ts[i];
      break;
    }
  }
  if (!head) return undefined;
  // "suit jacket" / "suit trousers" are parts of a suit.
  if (ts.includes("suit") && ["jacket", "trousers", "pants"].includes(head)) head = "suit";
  const colorFamilies = new Set(ts.map((t) => COLOR_FAMILY.get(t)).filter((f): f is string => !!f));
  return { text, head: CANON.get(head) ?? head, slot: SLOT_OF.get(head)!, colorFamilies };
}

/** Split a sheet cell like "navy suit, white shirt and black shoes" into garments. */
export function splitCostume(text: string): Garment[] {
  return text
    .split(/,|;|\band\b|\bwith\b|\bover\b|\+/i)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(parseGarment)
    .filter((g): g is Garment => !!g);
}

function headsCompatible(a: string, b: string): boolean {
  return a === b || a.endsWith(b) || b.endsWith(a);
}

export type GarmentRelation = "compatible" | "different_garment" | "different_colour" | "unrelated";

export function compareGarments(a: Garment, b: Garment): GarmentRelation {
  if (a.slot !== b.slot) return "unrelated";
  if (!headsCompatible(a.head, b.head)) return a.slot === "accessory" ? "unrelated" : "different_garment";
  if (a.colorFamilies.size && b.colorFamilies.size && ![...a.colorFamilies].some((c) => b.colorFamilies.has(c))) {
    return "different_colour";
  }
  return "compatible";
}

export interface SlotConflict {
  item: Garment;
  others: Garment[];
  relation: Exclude<GarmentRelation, "compatible" | "unrelated">;
}

/**
 * Does `item` conflict with the garments in `against`? Only when `against`
 * covers the same slot and nothing there is compatible with `item`.
 */
export function conflictWith(item: Garment, against: Garment[]): SlotConflict | undefined {
  const sameSlot = against.filter((g) => g.slot === item.slot);
  if (sameSlot.length === 0) return undefined;
  const relations = sameSlot.map((g) => compareGarments(item, g));
  if (relations.includes("compatible") || relations.every((r) => r === "unrelated")) return undefined;
  return {
    item,
    others: sameSlot,
    relation: relations.includes("different_garment") ? "different_garment" : "different_colour",
  };
}
