import type { SceneExtraction } from "@/lib/extract/schema";
import { emptyExtraction, fakeExtractModel } from "./fake-model";

type Costume = [who: string, garment: string, state?: SceneExtraction["costumes"][number]["state"]];
type Prop = [name: string, action: SceneExtraction["props"][number]["action"]];
export type ScenePlan = Record<string, { costumes?: Costume[]; props?: Prop[] }>;

/** What a careful extractor would read from data/script.fountain, scene by scene. */
export const CLEAN_PLAN: ScenePlan = {
  "1": { costumes: [["MAYA REYES", "green raincoat"], ["MAYA REYES", "grey sweater"], ["DANIEL REYES", "navy suit"], ["DANIEL REYES", "white shirt"]], props: [["brass key", "introduced"]] },
  "2": { costumes: [["VOSS", "brown cardigan"], ["DANIEL", "navy suit", "wet"]], props: [["ledger", "mentioned"]] },
  "3": { costumes: [["DANIEL", "suit jacket", "torn"]] },
  "4": { costumes: [["DANIEL", "torn suit jacket", "torn"], ["MAYA", "green raincoat"]] },
  "5": { costumes: [["DANIEL", "torn suit jacket", "torn"]], props: [["ledger", "mentioned"]] },
  "6": { costumes: [["DANIEL", "grey hoodies"], ["MAYA", "black leather jacket"], ["MAYA", "jeans"]], props: [["brass key", "used"]] },
  "7": { props: [["leather-bound ledger", "introduced"]] },
  "8": { costumes: [["OKAFOR", "charcoal overcoat"], ["MAYA", "black leather jacket"]], props: [["ledger", "mentioned"]] },
  "9": {
    costumes: [["VOSS", "oilskin coat"], ["MAYA", "black leather jacket", "scorched"]],
    props: [["brass key", "used"], ["leather-bound ledger", "used"], ["lantern", "destroyed"], ["leather-bound ledger", "destroyed"]],
  },
  "10": { costumes: [["OKAFOR", "charcoal overcoat"], ["MAYA", "scorched leather jacket", "scorched"]], props: [["brass key", "used"]] },
};

/** The same, for data/eval/script.seeded.fountain. */
export const SEEDED_PLAN: ScenePlan = {
  ...CLEAN_PLAN,
  "1": { costumes: [["MAYA REYES", "green raincoat"], ["MAYA REYES", "grey sweater"], ["DANIEL REYES", "black tuxedo"], ["DANIEL REYES", "white shirt"]], props: [["brass key", "introduced"]] },
  "2": { costumes: [["VOSS", "tweed blazer"], ["DANIEL", "navy suit", "wet"]], props: [["ledger", "mentioned"]] },
  "3": { costumes: [["DANIEL", "suit jacket", "torn"], ["VOSS", "yellow raincoat"]] },
  "4": { costumes: [["DANIEL", "suit jacket"], ["MAYA", "green raincoat"]] },
  "6": { costumes: [["DANIEL", "grey hoodies"], ["MAYA", "red bomber jacket"], ["MAYA", "jeans"]], props: [["brass key", "used"]] },
  "8": { costumes: [["OKAFOR", "camel overcoat"], ["MAYA", "black leather jacket"]], props: [["ledger", "mentioned"], ["brass key", "destroyed"]] },
  "9": {
    costumes: [["VOSS", "brown cardigan"], ["MAYA", "black leather jacket", "scorched"]],
    props: [["brass key", "used"], ["leather-bound ledger", "used"], ["lantern", "destroyed"], ["leather-bound ledger", "destroyed"]],
  },
  "10": { costumes: [["OKAFOR", "charcoal overcoat"], ["MAYA", "leather jacket"]], props: [["lantern", "used"], ["ledger", "used"]] },
};

/**
 * A fake extractor that follows a plan. Snippets are the garment/prop head word,
 * found by searching the script from the scene's first line, so provenance
 * verification runs for real.
 */
export function planExtractor(plan: ScenePlan, scriptText: string) {
  const lines = scriptText.split("\n");
  const lineOf = (needle: string, from: number) => lines.findIndex((l, i) => i + 1 >= from && l.toLowerCase().includes(needle.toLowerCase())) + 1;
  return fakeExtractModel((n, first, heading) => {
    const x = emptyExtraction(first, heading);
    const p = plan[n] ?? {};
    x.costumes = (p.costumes ?? []).map(([who, garment, state]) => {
      const word = garment.split(" ").at(-1)!.replace(/s$/, "");
      return { character: who, garment, state: state ?? "normal", state_detail: null, changes_into: false, source_line: lineOf(word, first), source_snippet: word };
    });
    x.props = (p.props ?? []).map(([name, action]) => {
      const word = name.split(" ").at(-1)!;
      return { name, action, holder: null, state: null, fixed_in_place: false, source_line: lineOf(word, first), source_snippet: word };
    });
    return x;
  });
}
