import OpenAI from "openai";
import { z } from "zod";
import { ModelOutputError, type ModelAdapter, type StructuredRequest, type StructuredResult } from "./types";

export type JsonMode = "json_schema" | "json_object";

export interface OpenAICompatibleOptions {
  provider: string;
  model: string;
  baseURL?: string;
  apiKey: string;
  /** json_schema where the server supports constrained decoding; json_object otherwise. */
  jsonMode: JsonMode;
  /** Extra request headers (OpenRouter app attribution). */
  headers?: Record<string, string>;
}

/** Strip a ```json fence if a model wrapped its answer in one. */
export function extractJson(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

/** Parse and validate model text against a schema, raising ModelOutputError with readable issues. */
export function parseStructured<T>(text: string, schema: z.ZodType<T>, spec: string): T {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(text));
  } catch {
    throw new ModelOutputError(`${spec} returned invalid JSON`, text);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ModelOutputError(`${spec} output failed validation: ${z.prettifyError(parsed.error)}`, text);
  }
  return parsed.data;
}

/**
 * Any server that speaks the OpenAI chat-completions protocol: OpenAI, Gemini,
 * OpenRouter, Groq, Together, Fireworks, DeepSeek, Mistral, xAI, and local
 * Ollama / LM Studio / vLLM.
 */
export class OpenAICompatibleAdapter implements ModelAdapter {
  readonly spec: string;
  private readonly client: OpenAI;

  constructor(private readonly opts: OpenAICompatibleOptions) {
    this.spec = `${opts.provider}:${opts.model}`;
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL, defaultHeaders: opts.headers });
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const jsonSchema = z.toJSONSchema(req.schema) as Record<string, unknown>;
    const system =
      this.opts.jsonMode === "json_object"
        ? `${req.system}\n\nRespond with a single JSON object that conforms to this JSON Schema:\n${JSON.stringify(jsonSchema)}`
        : req.system;

    const res = await this.client.chat.completions.create({
      model: this.opts.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: req.user },
      ],
      response_format:
        this.opts.jsonMode === "json_schema"
          ? { type: "json_schema", json_schema: { name: req.schemaName, schema: jsonSchema, strict: false } }
          : { type: "json_object" },
      max_tokens: req.maxTokens ?? 16000,
    });

    const choice = res.choices[0];
    const text = choice?.message?.content ?? "";
    if (choice?.finish_reason === "length") {
      throw new ModelOutputError(`${this.spec} hit the token limit before finishing`, text);
    }
    return {
      data: parseStructured(text, req.schema, this.spec),
      model: this.spec,
      usage: { inputTokens: res.usage?.prompt_tokens, outputTokens: res.usage?.completion_tokens },
    };
  }
}
