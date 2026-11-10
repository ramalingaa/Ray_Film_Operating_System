import type { z } from "zod";

export interface StructuredRequest<T> {
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Short identifier for the output schema (used by providers that need a name). */
  schemaName: string;
  maxTokens?: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  /** The "<provider>:<model>" spec that produced this result. */
  model: string;
  usage: Usage;
}

export interface ModelAdapter {
  readonly spec: string;
  generate<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>>;
}

/** The model answered, but the answer is unusable (invalid JSON, schema mismatch, truncated). Retryable with feedback. */
export class ModelOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = "ModelOutputError";
  }
}

/** The model declined to answer. Not retryable on the same model. */
export class ModelRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelRefusalError";
  }
}

/** Configuration problem (unknown provider, missing key). Not retryable. */
export class ModelConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConfigError";
  }
}

// ---- tool calling (the project agent) ------------------------------------------

/** A tool the model may call. `parameters` is a JSON Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
}

export interface ChatResult {
  /** Text the model wrote alongside (or instead of) tool calls. */
  text: string;
  toolCalls: ToolCall[];
  /** "tool_use": the model wants tool results. "end": it finished its turn. */
  stop: "tool_use" | "end" | "max_tokens";
  model: string;
  usage: Usage;
}

/** Adapters that can run a tool-calling conversation. */
export interface ChatAdapter {
  chat(req: ChatRequest): Promise<ChatResult>;
}

export function canChat(a: ModelAdapter): a is ModelAdapter & ChatAdapter {
  return typeof (a as Partial<ChatAdapter>).chat === "function";
}
