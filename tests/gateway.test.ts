import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AllModelsFailedError, createAdapter, ModelGateway, parseModelSpec, rolesFromEnv } from "@/lib/llm/gateway";
import { parseStructured } from "@/lib/llm/openai-compatible";
import { ModelConfigError, ModelOutputError, type ModelAdapter, type StructuredRequest } from "@/lib/llm/types";

const schema = z.object({ answer: z.number() });
const req: StructuredRequest<{ answer: number }> = { system: "s", user: "u", schema, schemaName: "t" };

function scripted(spec: string, responses: (unknown | Error)[]): ModelAdapter & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    spec,
    prompts,
    async generate<T>(r: StructuredRequest<T>) {
      prompts.push(r.user);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { data: r.schema.parse(next), model: spec, usage: {} };
    },
  };
}

describe("model specs", () => {
  it("parses provider:model, keeping colons in model ids", () => {
    expect(parseModelSpec("ollama:qwen3:32b")).toEqual({ provider: "ollama", model: "qwen3:32b" });
    expect(() => parseModelSpec("gpt-5")).toThrow(ModelConfigError);
  });
  it("refuses unknown providers and missing keys", () => {
    expect(() => createAdapter("nope:x", {})).toThrow(/unknown provider/);
    expect(() => createAdapter("openai:gpt-5", {})).toThrow(/OPENAI_API_KEY/);
    expect(createAdapter("ollama:llama4", {}).spec).toBe("ollama:llama4");
  });
  it("accepts OPEN_ROUTER_LLM_KEY as the OpenRouter key, keeping ':free' in model ids", () => {
    expect(() => createAdapter("openrouter:tencent/hy4", {})).toThrow(/OPENROUTER_API_KEY or OPEN_ROUTER_LLM_KEY/);
    expect(() => createAdapter("openrouter:tencent/hy4", { OPEN_ROUTER_LLM_KEY: "  " })).toThrow(ModelConfigError);
    expect(createAdapter("openrouter:nvidia/nemotron-3.5-super-vl:free", { OPEN_ROUTER_LLM_KEY: "test-key" }).spec).toBe(
      "openrouter:nvidia/nemotron-3.5-super-vl:free",
    );
  });
  it("reads role lists from env with an anthropic default", () => {
    expect(rolesFromEnv({ MODEL_JUDGE: "openai:gpt-5, gemini:gemini-3-pro" })).toEqual({
      extract: ["anthropic:claude-sonnet-5"],
      judge: ["openai:gpt-5", "gemini:gemini-3-pro"],
    });
  });
});

describe("ModelGateway", () => {
  it("retries once with the validation error appended", async () => {
    const a = scripted("x:a", [new ModelOutputError("bad shape", "{}"), { answer: 42 }]);
    const g = new ModelGateway({ extract: ["x:a"], judge: [] }, () => a);
    const r = await g.generate("extract", req);
    expect(r.data.answer).toBe(42);
    expect(a.prompts[1]).toContain("bad shape");
  });

  it("falls back to the next model and reports every attempt", async () => {
    const a = scripted("x:a", [new Error("503"), ]);
    const b = scripted("x:b", [{ answer: 7 }]);
    const g = new ModelGateway({ extract: ["x:a", "x:b"], judge: [] }, (s) => (s === "x:a" ? a : b));
    const r = await g.generate("extract", req);
    expect(r.model).toBe("x:b");
    expect(r.attempts.map((x) => x.outcome)).toEqual(["error", "ok"]);
  });

  it("throws AllModelsFailedError when nothing works", async () => {
    const a = scripted("x:a", [new ModelOutputError("bad", ""), new ModelOutputError("still bad", "")]);
    const g = new ModelGateway({ extract: ["x:a"], judge: [] }, () => a);
    await expect(g.generate("extract", req)).rejects.toBeInstanceOf(AllModelsFailedError);
  });
});

describe("parseStructured", () => {
  it("accepts fenced JSON and rejects schema mismatches", () => {
    expect(parseStructured("```json\n{\"answer\": 1}\n```", schema, "t")).toEqual({ answer: 1 });
    expect(() => parseStructured("{\"answer\":\"one\"}", schema, "t")).toThrow(ModelOutputError);
    expect(() => parseStructured("not json", schema, "t")).toThrow(/invalid JSON/);
  });
});
