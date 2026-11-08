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
  /**
   * Extra request-body fields, e.g. OpenRouter's `reasoning`. If the server
   * rejects them (400 naming one of these fields), the request is sent again
   * without them.
   */
  extraBody?: Record<string, unknown>;
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

    const body = {
      model: this.opts.model,
      messages: [
        { role: "system" as const, content: system },
        { role: "user" as const, content: req.user },
      ],
      response_format:
        this.opts.jsonMode === "json_schema"
          ? { type: "json_schema" as const, json_schema: { name: req.schemaName, schema: jsonSchema, strict: false } }
          : { type: "json_object" as const },
      max_tokens: req.maxTokens ?? 16000,
    };
    const extra = this.opts.extraBody ?? {};
    let res;
    try {
      res = await this.client.chat.completions.create({ ...body, ...extra } as typeof body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const keys = Object.keys(extra);
      if (!keys.length || !/400/.test(msg) || !keys.some((k) => msg.toLowerCase().includes(k))) throw err;
      res = await this.client.chat.completions.create(body);
    }

    const choice = res.choices[0];
    const text = choice?.message?.content ?? "";
    if (choice?.finish_reason === "length") {
      const reasoning = (res.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)?.completion_tokens_details?.reasoning_tokens ?? 0;
      throw new ModelOutputError(
        reasoning > 0 && reasoning >= (res.usage?.completion_tokens ?? 0) * 0.8
          ? `${this.spec} spent ${reasoning} of its ${res.usage?.completion_tokens} output tokens reasoning and ran out before answering`
          : `${this.spec} hit the token limit before finishing`,
        text,
      );
    }
    return {
      data: parseStructured(text, req.schema, this.spec),
      model: this.spec,
      usage: { inputTokens: res.usage?.prompt_tokens, outputTokens: res.usage?.completion_tokens },
    };
  }
}
