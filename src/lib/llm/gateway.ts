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
  /** Env vars that may hold the key, first match wins. */
  keyEnv?: string | string[];
  /** Local servers accept any key. */
  localKey?: string;
  jsonMode: JsonMode;
}

/** Every provider below speaks the OpenAI chat-completions protocol. */
export const OPENAI_COMPATIBLE_PROVIDERS: Record<string, ProviderDef> = {
  openai: { keyEnv: "OPENAI_API_KEY", jsonMode: "json_schema" },
  gemini: { baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/", keyEnv: "GEMINI_API_KEY", jsonMode: "json_schema" },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", keyEnv: ["OPENROUTER_API_KEY", "OPEN_ROUTER_LLM_KEY"], jsonMode: "json_schema" },
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
  const keyEnvs = def.keyEnv === undefined ? [] : [def.keyEnv].flat();
  const apiKey = keyEnvs.length ? keyEnvs.map((k) => env[k]?.trim()).find(Boolean) : def.localKey;
  if (!apiKey) throw new ModelConfigError(`${provider}: set ${keyEnvs.join(" or ")}`);
  return new OpenAICompatibleAdapter({
    provider,
    model,
    apiKey,
    baseURL: (def.baseURLEnv && env[def.baseURLEnv]) || def.baseURL,
    jsonMode: def.jsonMode,
    headers: provider === "openrouter" ? { "HTTP-Referer": "https://github.com/reelgraph", "X-Title": "ReelGraph" } : undefined,
    extraBody: provider === "openrouter" ? openRouterReasoning(env) : undefined,
  });
}

/**
 * Extraction and judging are structured tasks that do not need long hidden
 * reasoning, and reasoning models can spend their whole output budget on it
 * (seen: 3,874 of 4,000 tokens, no answer). So OpenRouter calls ask for no
 * reasoning unless OPENROUTER_REASONING is set to low, medium or high.
 */
export function openRouterReasoning(env: Env): Record<string, unknown> {
  const v = env.OPENROUTER_REASONING?.trim().toLowerCase();
  if (v === "low" || v === "medium" || v === "high") return { reasoning: { effort: v } };
  return { reasoning: { enabled: false } };
}

/** Used when MODEL_EXTRACT / MODEL_JUDGE are unset and only an OpenRouter key is present. */
export const DEFAULT_OPENROUTER_MODELS = "openrouter:nvidia/nemotron-3.5-super-vl:free,openrouter:deepseek/deepseek-v4.1-flash,openrouter:tencent/hy4";

/**
 * Read role → model lists from env (MODEL_EXTRACT, MODEL_JUDGE). Unset roles
 * default to Anthropic when its key is set, else to OpenRouter when its key is
 * set, else to Anthropic (which then reports the missing key).
 */
export function rolesFromEnv(env: Env = process.env): Record<Role, string[]> {
  const hasOpenRouter = !!(env.OPENROUTER_API_KEY?.trim() || env.OPEN_ROUTER_LLM_KEY?.trim());
  const hasAnthropic = !!(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_PROFILE);
  const fallback = !hasAnthropic && hasOpenRouter ? DEFAULT_OPENROUTER_MODELS : `anthropic:${env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL}`;
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

/**
 * Errors worth one more try on the same model: OpenRouter's "retry after
 * in-flight requests settle" credit hold, gateway timeouts, dropped
 * connections. A daily quota or an empty balance is not transient: those go
 * straight to the next model.
 */
export function isTransient(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (/free-models-per-day|requires more credits|can only afford/i.test(msg)) return false;
  return /in-flight requests settle|(502|503|504)|ECONNRESET|ETIMEDOUT|socket hang up|overloaded/i.test(msg);
}

async function withTransientRetry<T>(fn: () => Promise<T>, delaysMs: number[]): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= delaysMs.length || !isTransient(err)) throw err;
      await new Promise((r) => setTimeout(r, delaysMs[i]));
    }
  }
}

export class ModelGateway {
  private readonly adapters = new Map<string, ModelAdapter>();

  constructor(
    private readonly roles: Record<Role, string[]>,
    private readonly factory: AdapterFactory = (s) => createAdapter(s),
    /** Waits before each retry of a transient provider error. */
    private readonly retryDelaysMs: number[] = [3000, 8000],
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
      const r = await withTransientRetry(() => adapter.generate(req), this.retryDelaysMs);
      attempts.push({ model: spec, outcome: "ok" });
      return r;
    } catch (err) {
      if (!(err instanceof ModelOutputError)) throw err;
      attempts.push({ model: spec, outcome: "invalid_output", message: err.message });
      const retry: StructuredRequest<T> = {
        ...req,
        user: `${req.user}\n\nYour previous answer was rejected: ${err.message}\nReturn a corrected answer that satisfies the schema exactly.`,
      };
      const r = await withTransientRetry(() => adapter.generate(retry), this.retryDelaysMs);
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
