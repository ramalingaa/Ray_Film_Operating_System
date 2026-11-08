import type { ModelAdapter, StructuredRequest } from "@/lib/llm/types";

type Handler = (req: StructuredRequest<unknown>) => unknown | Promise<unknown>;

/**
 * A model stand-in that answers by output schema ("scene_extraction",
 * "scene_outline", "story_analysis", "verdict", ...). Counts calls per schema.
 * A handler may throw to simulate a failing model.
 */
export function routerModel(handlers: Record<string, Handler>, spec = "fake:router"): ModelAdapter & { calls: Record<string, number> } {
  const model = {
    spec,
    calls: {} as Record<string, number>,
    async generate<T>(req: StructuredRequest<T>) {
      model.calls[req.schemaName] = (model.calls[req.schemaName] ?? 0) + 1;
      const h = handlers[req.schemaName];
      if (!h) throw new Error(`no fake answer for ${req.schemaName}`);
      return { data: req.schema.parse(await h(req as StructuredRequest<unknown>)), model: spec, usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return model;
}
