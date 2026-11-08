import { describe, expect, it } from "vitest";
import { buildStoryTestReport, type StoryDraft } from "@/lib/stages/story-test";

const paragraph = (n: number, words: string) => `${words} ${"and the harbor keeps its secrets ".repeat(n)}`.trim();
// A long enough story (over 400 words) for beat timing, with known phrases on known lines.
const story = [
  paragraph(20, "Maya waits on the pier in the rain."),
  "",
  paragraph(20, "Her brother Daniel gives her a brass key."),
  "",
  paragraph(20, "She decides to find the ledger herself."),
  "",
  paragraph(20, "In the lighthouse the ledger burns."),
  "",
  paragraph(20, "Maya walks into the sunrise."),
].join("\n");

const draft = (over: Partial<StoryDraft> = {}): StoryDraft => ({
  logline: { protagonist: "Maya", goal: "find the ledger", stakes: null, obstacle: "Voss", one_sentence: "Maya hunts her father's ledger.", missing: ["stakes"], source_line: 5, source_snippet: "She decides to find the ledger herself." },
  beats: [
    { beat: "opening_image", present: true, note: "Rain on the pier.", source_line: 1, source_snippet: "Maya waits on the pier in the rain." },
    { beat: "catalyst", present: true, note: "The key.", source_line: 3, source_snippet: "gives her a brass key" },
    { beat: "midpoint", present: true, note: "Invented line.", source_line: 5, source_snippet: "Maya meets a talking seagull" },
    { beat: "final_image", present: true, note: "Sunrise.", source_line: 9, source_snippet: "Maya walks into the sunrise." },
  ],
  setups: [{ description: "The brass key", paid_off: false, source_line: 3, source_snippet: "a brass key" }],
  strengths: [{ point: "A clear image to open on.", source_line: 1, source_snippet: "in the rain" }],
  questions: [{ question: "Why now?", why: "The catalyst needs urgency." }],
  ...over,
});

describe("story test report", () => {
  const r = buildStoryTestReport(draft(), story, { model: "fake", cacheHit: false });

  it("keeps verified citations and drops invented ones", () => {
    expect(r.beats.find((b) => b.id === "catalyst")).toMatchObject({ present: true, cite: { line: 3 } });
    expect(r.beats.find((b) => b.id === "midpoint")).toMatchObject({ present: false, timing: "missing" });
    expect(r.dropped).toEqual(["Midpoint: the quoted words were not found in the story"]);
  });

  it("measures where beats fall in the story", () => {
    expect(r.tooShortToTime).toBe(false);
    expect(r.beats.find((b) => b.id === "opening_image")?.position).toBe(0);
    expect(r.beats.find((b) => b.id === "final_image")!.position!).toBeGreaterThan(0.75);
  });

  it("raises development notes for unclear stakes, missing beats and unpaid setups, and keeps the producer's questions", () => {
    const titles = r.issues.map((i) => i.title);
    expect(titles).toContain("Not clear yet: stakes");
    expect(titles).toContain("No Midpoint yet");
    expect(titles).toContain("Set up, never paid off");
    expect(r.questions).toEqual([{ question: "Why now?", why: "The catalyst needs urgency." }]);
  });

  it("does not time beats in a logline-length story, and flags a missing protagonist as high", () => {
    const short = buildStoryTestReport(
      draft({ logline: { protagonist: null, goal: null, stakes: null, obstacle: null, one_sentence: "-", missing: ["protagonist", "goal"], source_line: null, source_snippet: null } }),
      "Maya waits on the pier in the rain.",
      { model: "fake", cacheHit: false },
    );
    expect(short.tooShortToTime).toBe(true);
    expect(short.beats.find((b) => b.id === "opening_image")).toMatchObject({ present: true, position: null, timing: "on_time" });
    expect(short.issues[0]).toMatchObject({ severity: "high", title: "The protagonist and goal are not clear yet" });
  });
});
