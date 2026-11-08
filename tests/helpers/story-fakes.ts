/**
 * A complete structure read for whatever screenplay is in the prompt: one card
 * per scene and five beats, each citing its scene heading and using the scene
 * numbers marked in the margin ("   45 [scene 6]| INT. ..."). Real enough to
 * pass the completeness check.
 */
export function fullStructureRead(req: { user: string }) {
  const scenes = [...req.user.matchAll(/^\s*(\d+) \[scene ([^\]]+)\]\| (.*)$/gm)].map((m) => ({ line: Number(m[1]), number: m[2], heading: m[3] }));
  const at = (i: number) => scenes[Math.min(i, scenes.length - 1)];
  return {
    logline: { protagonist: null, goal: null, stakes: null, obstacle: null, one_sentence: "-", missing: [], source_line: at(0).line, source_snippet: at(0).heading },
    beats: ["opening_image", "catalyst", "midpoint", "all_is_lost", "final_image"].map((beat, i) => ({
      beat,
      scene_number: at(i).number,
      note: "-",
      source_line: at(i).line,
      source_snippet: at(i).heading,
    })),
    scenes: scenes.map((s) => ({ scene_number: s.number, purpose: "-", conflict: null, start_value: "a", end_value: "b", turns: true, source_line: s.line, source_snippet: s.heading })),
    setups: [],
  };
}
