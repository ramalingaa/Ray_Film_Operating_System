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
