import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ModelOutputError, ModelRefusalError, type ModelAdapter, type StructuredRequest, type StructuredResult } from "./types";

/** Claude models through the official SDK, using structured outputs for schema-valid JSON. */
export class AnthropicAdapter implements ModelAdapter {
  readonly spec: string;
  private readonly client: Anthropic;

  constructor(
    private readonly model: string,
    client?: Anthropic,
  ) {
    this.spec = `anthropic:${model}`;
    this.client = client ?? new Anthropic();
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const res = await this.client.messages.parse({
      model: this.model,
      max_tokens: req.maxTokens ?? 16000,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
      output_config: { format: zodOutputFormat(req.schema) },
    });

    if (res.stop_reason === "refusal") {
      throw new ModelRefusalError(`${this.spec} declined: ${res.stop_details?.explanation ?? "no explanation"}`);
    }
    const raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    if (res.stop_reason === "max_tokens") {
      throw new ModelOutputError(`${this.spec} hit max_tokens before finishing`, raw);
    }
    if (res.parsed_output == null) {
      throw new ModelOutputError(`${this.spec} returned output that did not match the schema`, raw);
    }
    return {
      data: res.parsed_output as T,
      model: this.spec,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}
