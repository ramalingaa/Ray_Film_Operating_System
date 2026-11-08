/**
 * Model gateway: turns "<provider>:<model>" specs into adapters, routes roles
 * (extract, judge, ...) to ordered model lists, retries once on invalid output
 * with the validation error fed back, and falls back to the next model.
 */
import { AnthropicAdapter } from "./anthropic";
import { OpenAICompatibleAdapter, type JsonMode } from "./openai-compatible";
import {
  ModelConfigError,
  ModelOutputError,
  ModelRefusalError,
  type ModelAdapter,
  type StructuredRequest,
  type StructuredResult,
} from "./types";

export type Role = "extract" | "judge";
export type Env = Record<string, string | undefined>;

interface ProviderDef {
  baseURL?: string;
  baseURLEnv?: string;
  keyEnv?: string;
  /** Local servers accept any key. */
  localKey?: string;
  jsonMode: JsonMode;
}

/** Every provider below speaks the OpenAI chat-completions protocol. */
export const OPENAI_COMPATIBLE_PROVIDERS: Record<string, ProviderDef> = {
  openai: { keyEnv: "OPENAI_API_KEY", jsonMode: "json_schema" },
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", keyEnv: "GEMINI_API_KEY", jsonMode: "json_schema" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY", jsonMode: "json_schema" },
  groq: { baseURL: "https://api.groq.com/openai/v1", keyEnv: "GROQ_API_KEY", jsonMode: "json_schema" },
  together: { baseURL: "https://api.together.xyz/v1", keyEnv: "TOGETHER_API_KEY", jsonMode: "json_schema" },
  fireworks: { baseURL: "https://api.fireworks.ai/inference/v1", keyEnv: "FIREWORKS_API_KEY", jsonMode: "json_schema" },
  deepseek: { baseURL: "https://api.deepseek.com/v1", keyEnv: "DEEPSEEK_API_KEY", jsonMode: "json_object" },
  mistral: { baseURL: "https://api.mistral.ai/v1", keyEnv: "MISTRAL_API_KEY", jsonMode: "json_schema" },
  xai: { baseURL: "https://api.x.ai/v1", keyEnv: "XAI_API_KEY", jsonMode: "json_schema" },
  ollama: { baseURLEnv: "OLLAMA_BASE_URL", baseURL: "http://localhost:11434/v1", localKey: "ollama", jsonMode: "json_schema" },
  lmstudio: { baseURLEnv: "LMSTUDIO_BASE_URL", baseURL: "http://localhost:1234/v1", localKey: "lmstudio", jsonMode: "json_schema" },
  vllm: { baseURLEnv: "VLLM_BASE_URL", baseURL: "http://localhost:8000/v1", localKey: "vllm", jsonMode: "json_schema" },
};

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

export function parseModelSpec(spec: string): { provider: string; model: string } {
  const idx = spec.indexOf(":");
  if (idx <= 0 || idx === spec.length - 1) {
    throw new ModelConfigError(`model "${spec}" must look like <provider>:<model-id>`);
  }
  return { provider: spec.slice(0, idx).trim().toLowerCase(), model: spec.slice(idx + 1).trim() };
}

export function createAdapter(spec: string, env: Env = process.env): ModelAdapter {
  const { provider, model } = parseModelSpec(spec);
  if (provider === "anthropic") {
    if (!env.ANTHROPIC_API_KEY && !env.ANTHROPIC_AUTH_TOKEN && !env.ANTHROPIC_PROFILE) {
      throw new ModelConfigError("anthropic: set ANTHROPIC_API_KEY (or log in with `ant auth login`)");
    }
    return new AnthropicAdapter(model);
  }
  const def = OPENAI_COMPATIBLE_PROVIDERS[provider];
  if (!def) {
    const known = ["anthropic", ...Object.keys(OPENAI_COMPATIBLE_PROVIDERS)].join(", ");
    throw new ModelConfigError(`unknown provider "${provider}" (known: ${known})`);
  }
  const apiKey = def.keyEnv ? env[def.keyEnv] : def.localKey;
  if (!apiKey) throw new ModelConfigError(`${provider}: set ${def.keyEnv}`);
  return new OpenAICompatibleAdapter({
    provider,
    model,
    apiKey,
    baseURL: (def.baseURLEnv && env[def.baseURLEnv]) || def.baseURL,
    jsonMode: def.jsonMode,
  });
}

/** Read role → model lists from env (MODEL_EXTRACT, MODEL_JUDGE). */
export function rolesFromEnv(env: Env = process.env): Record<Role, string[]> {
  const fallback = `anthropic:${env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL}`;
  const list = (v: string | undefined) =>
    (v || fallback)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return { extract: list(env.MODEL_EXTRACT), judge: list(env.MODEL_JUDGE) };
}

export interface AttemptLog {
  model: string;
  outcome: "ok" | "invalid_output" | "refused" | "error";
  message?: string;
}

export class AllModelsFailedError extends Error {
  constructor(
    readonly role: Role,
    readonly attempts: AttemptLog[],
  ) {
    super(`every ${role} model failed: ${attempts.map((a) => `${a.model} (${a.outcome}: ${a.message})`).join("; ")}`);
    this.name = "AllModelsFailedError";
  }
}

export type AdapterFactory = (spec: string) => ModelAdapter;

export class ModelGateway {
  private readonly adapters = new Map<string, ModelAdapter>();

  constructor(
    private readonly roles: Record<Role, string[]>,
    private readonly factory: AdapterFactory = (s) => createAdapter(s),
  ) {}

  static fromEnv(env: Env = process.env): ModelGateway {
    return new ModelGateway(rolesFromEnv(env), (s) => createAdapter(s, env));
  }

  specs(role: Role): string[] {
    return this.roles[role];
  }

  adapter(spec: string): ModelAdapter {
    let a = this.adapters.get(spec);
    if (!a) {
      a = this.factory(spec);
      this.adapters.set(spec, a);
    }
    return a;
  }

  /**
   * Ask one specific model, retrying once with the validation error appended
   * when the output is malformed.
   */
  async generateWith<T>(spec: string, req: StructuredRequest<T>, attempts: AttemptLog[] = []): Promise<StructuredResult<T>> {
    const adapter = this.adapter(spec);
    try {
      const r = await adapter.generate(req);
      attempts.push({ model: spec, outcome: "ok" });
      return r;
    } catch (err) {
      if (!(err instanceof ModelOutputError)) throw err;
      attempts.push({ model: spec, outcome: "invalid_output", message: err.message });
      const retry: StructuredRequest<T> = {
        ...req,
        user: `${req.user}\n\nYour previous answer was rejected: ${err.message}\nReturn a corrected answer that satisfies the schema exactly.`,
      };
      const r = await adapter.generate(retry);
      attempts.push({ model: spec, outcome: "ok", message: "after validation retry" });
      return r;
    }
  }

  /** Try each model for the role in order until one returns a valid answer. */
  async generate<T>(role: Role, req: StructuredRequest<T>): Promise<StructuredResult<T> & { attempts: AttemptLog[] }> {
    const attempts: AttemptLog[] = [];
    for (const spec of this.roles[role]) {
      try {
        const r = await this.generateWith(spec, req, attempts);
        return { ...r, attempts };
      } catch (err) {
        if (err instanceof ModelConfigError) throw err;
        const outcome = err instanceof ModelRefusalError ? "refused" : err instanceof ModelOutputError ? "invalid_output" : "error";
        attempts.push({ model: spec, outcome, message: err instanceof Error ? err.message : String(err) });
      }
    }
    throw new AllModelsFailedError(role, attempts);
  }
}
