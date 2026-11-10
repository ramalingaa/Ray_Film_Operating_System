import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  ModelOutputError,
  ModelRefusalError,
  type ChatAdapter,
  type ChatMessage,
  type ChatRequest,
  type ChatResult,
  type ModelAdapter,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

/** Claude models through the official SDK, using structured outputs for schema-valid JSON. */
export class AnthropicAdapter implements ModelAdapter, ChatAdapter {
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

  /** A tool-calling turn: Claude's native tool use. */
  async chat(req: ChatRequest): Promise<ChatResult> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: req.maxTokens ?? 8000,
      system: req.system,
      tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })),
      messages: toAnthropicMessages(req.messages),
    });
    if (res.stop_reason === "refusal") throw new ModelRefusalError(`${this.spec} declined to continue`);
    let text = "";
    const toolCalls: ChatResult["toolCalls"] = [];
    for (const b of res.content) {
      if (b.type === "text") text += b.text;
      else if (b.type === "tool_use") toolCalls.push({ id: b.id, name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
    }
    return {
      text,
      toolCalls,
      stop: toolCalls.length ? "tool_use" : res.stop_reason === "max_tokens" ? "max_tokens" : "end",
      model: this.spec,
      usage: { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens },
    };
  }
}

/**
 * Anthropic wants alternating user/assistant turns, with tool results as
 * tool_result blocks inside a user turn. Consecutive same-role turns merge.
 */
export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: { role: "user" | "assistant"; content: Anthropic.ContentBlockParam[] }[] = [];
  const push = (role: "user" | "assistant", blocks: Anthropic.ContentBlockParam[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const m of messages) {
    if (m.role === "user") push("user", [{ type: "text", text: m.content || "(empty)" }]);
    else if (m.role === "tool") push("user", [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content || "(no output)" }]);
    else {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content.trim()) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      push("assistant", blocks.length ? blocks : [{ type: "text", text: "(continuing)" }]);
    }
  }
  if (out[0]?.role !== "user") out.unshift({ role: "user", content: [{ type: "text", text: "Begin." }] });
  return out;
}
