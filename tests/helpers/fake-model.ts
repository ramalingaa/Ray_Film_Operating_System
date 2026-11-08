import type { ModelAdapter, StructuredRequest } from "@/lib/llm/types";
import type { SceneExtraction } from "@/lib/extract/schema";

export const emptyExtraction = (line: number, heading: string): SceneExtraction => ({
  characters: [],
  setting: { location: "X", int_ext: "INT", time_of_day: "DAY", source_line: line, source_snippet: heading },
  time_of_day_evidence: [],
  story_day: { relation: "unknown", day: null, reasoning: "", source_line: line, source_snippet: heading },
  costumes: [],
  props: [],
  knowledge: [],
  relationships: [],
});

/** A model stand-in: answers by scene number, counts calls. */
export function fakeExtractModel(bySceneNumber: (n: string, firstLine: number, heading: string) => SceneExtraction): ModelAdapter & { calls: number } {
  const model = {
    spec: "fake:extractor",
    calls: 0,
    async generate<T>(req: StructuredRequest<T>) {
      model.calls++;
      const n = /Scene (\S+), with line numbers/.exec(req.user)![1];
      const first = /^\s*(\d+)\| (.*)$/m.exec(req.user)!;
      return { data: req.schema.parse(bySceneNumber(n, Number(first[1]), first[2])), model: "fake:extractor", usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return model;
}
