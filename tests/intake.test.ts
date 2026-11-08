import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { parseFountain } from "@/lib/fountain";
import { renderOutline, unsupported, type Adaptation } from "@/lib/intake/adapt";
import { classifyInput } from "@/lib/intake/classify";
import { fdxToFountain, isFdx } from "@/lib/intake/fdx";
import { formatEighths, sceneEighths } from "@/lib/intake/pages";

const script = fs.readFileSync("data/script.fountain", "utf8");

describe("classifyInput", () => {
  it("reads Fountain with scene headings as a screenplay", () => {
    const c = classifyInput(script, "script.fountain");
    expect(c).toMatchObject({ kind: "screenplay", format: "fountain" });
    expect(c.parsed?.scenes).toHaveLength(10);
  });
  it("reads prose and a single logline as a story", () => {
    expect(classifyInput("A lighthouse keeper's daughter discovers her father's ledger and must decide whether to burn it.").kind).toBe("story");
    expect(classifyInput("Maya waits on the pier in the rain.\n\nHer brother Daniel arrives with a key.").kind).toBe("story");
  });
  it("needs dialogue to accept a single scene as a screenplay", () => {
    expect(classifyInput("INT. KITCHEN - DAY\n\nShe cooks.").kind).toBe("story");
    expect(classifyInput("INT. KITCHEN - DAY\n\nShe cooks.\n\nMAYA\nDinner's ready.").kind).toBe("screenplay");
  });
});

const FDX = `<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft DocumentType="Script" Version="5">
<Content>
<Paragraph Type="Scene Heading"><Text>INT. HARBOR OFFICE - NIGHT</Text></Paragraph>
<Paragraph Type="Action"><Text>VOSS looks up. </Text><Text>Rain &amp; wind.</Text></Paragraph>
<Paragraph Type="Character"><Text>Voss</Text></Paragraph>
<Paragraph Type="Parenthetical"><Text>(quietly)</Text></Paragraph>
<Paragraph Type="Dialogue"><Text>You&apos;re late.</Text></Paragraph>
<Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
<Paragraph Type="Scene Heading"><Text>EXT. PIER - CONTINUOUS</Text></Paragraph>
<Paragraph Type="Action"><Text>Maya runs.</Text></Paragraph>
</Content>
<TitlePage><Content><Paragraph><Text>The Keeper</Text></Paragraph></Content></TitlePage>
</FinalDraft>`;

describe("Final Draft import", () => {
  it("converts paragraphs to Fountain that parses into the same scenes and speakers", () => {
    expect(isFdx(FDX)).toBe(true);
    const r = fdxToFountain(FDX);
    expect(r.title).toBe("The Keeper");
    const parsed = parseFountain(r.text);
    expect(parsed.scenes.map((s) => s.heading)).toEqual(["INT. HARBOR OFFICE - NIGHT", "EXT. PIER - CONTINUOUS"]);
    expect(parsed.scenes[0].speakers).toEqual(["VOSS"]);
    expect(r.text).toContain("Rain & wind.");
    expect(r.text).toContain("You're late.");
    expect(classifyInput(FDX, "x.fdx")).toMatchObject({ kind: "screenplay", format: "fdx" });
  });
});

describe("page estimates", () => {
  it("gives every scene at least an eighth and formats pages", () => {
    const parsed = parseFountain(script);
    const eighths = parsed.scenes.map(sceneEighths);
    expect(Math.min(...eighths)).toBeGreaterThanOrEqual(1);
    expect(eighths.reduce((a, b) => a + b, 0)).toBeGreaterThan(8); // more than a page in total
    expect(formatEighths(3)).toBe("3/8");
    expect(formatEighths(8)).toBe("1");
    expect(formatEighths(13)).toBe("1 5/8");
  });
});

const STORY = "Maya waits on the rainy pier at night. Her brother Daniel brings a brass key from their father's old friend Voss.";
const outline: Adaptation = {
  title: "The Key",
  scenes: [
    { int_ext: "EXT", location: "pier", time_of_day: "night", action: ["Rain. MAYA waits.", "DANIEL arrives and hands her a brass key."], source_excerpt: "Maya waits on the rainy pier at night" },
    { int_ext: "INT", location: "Voss's office", time_of_day: "night", action: ["VOSS watches the harbor."], source_excerpt: "Voss counts his money" },
  ],
};

describe("story adaptation", () => {
  it("renders well-formed Fountain the parser reads back scene for scene", () => {
    const text = renderOutline(outline, "fallback");
    const parsed = parseFountain(text);
    expect(parsed.titlePage.title).toBe("The Key");
    expect(parsed.scenes.map((s) => s.heading)).toEqual(["EXT. PIER - NIGHT", "INT. VOSS'S OFFICE - NIGHT"]);
    expect(classifyInput(text).kind).toBe("screenplay");
  });
  it("reports scenes whose quoted source is not in the story", () => {
    expect(unsupported(outline, STORY)).toEqual([2]);
  });
});
