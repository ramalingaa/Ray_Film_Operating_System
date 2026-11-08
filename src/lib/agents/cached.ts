/**
 * A structured model call whose answer is cached in `llm_cache` under
 * hash(prompt version + model list + input). Re-running a stage on the same
 * input costs nothing. Every call, cached or not, is recorded in `agent_runs`
 * like any other agent run.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { llmCache } from "../db/schema";
import type { Role } from "../llm/gateway";
import type { StructuredRequest, Usage } from "../llm/types";
import type { AgentContext } from "./runtime";

export interface CachedResult<T> {
  data: T;
  model: string;
  cacheHit: boolean;
  usage?: Usage;
}

export async function cachedGenerate<T>(
  ctx: AgentContext,
  role: Role,
  promptVersion: string,
  req: StructuredRequest<T>,
  label: string,
  inputRef = label,
  /**
   * Completeness check for a schema-valid answer: returns what is missing, or
   * null. An incomplete answer is never cached; the model is asked once more
   * with the gap spelled out, then the call fails.
   */
  complete?: (data: T) => string | null,
): Promise<CachedResult<T>> {
  if (!ctx.gateway) throw new Error(`${label} needs a model (none configured)`);
  const runId = await ctx.ledger.start(`${label}@${promptVersion}`, inputRef);
  try {
    const models = ctx.gateway.specs(role);
    const key = crypto.createHash("sha256").update(`${promptVersion}\u0000${models.join(",")}\u0000${req.system}\u0000${req.user}`).digest("hex");

    const [cached] = await ctx.db.select().from(llmCache).where(eq(llmCache.key, key));
    if (cached) {
      const parsed = req.schema.safeParse(JSON.parse(cached.responseJson));
      if (parsed.success && !complete?.(parsed.data)) {
        await ctx.ledger.finish(runId, "ok", { model: cached.model, cacheHit: true });
        return { data: parsed.data, model: cached.model, cacheHit: true };
      }
      await ctx.ledger.issue(label, "warning", inputRef, "cached answer is unusable (schema or completeness); asking again");
    }

    let result = await ctx.gateway.generate(role, req);
    for (const a of result.attempts.filter((a) => a.outcome !== "ok")) {
      await ctx.ledger.issue(label, "warning", inputRef, `${a.model}: ${a.outcome} (${a.message})`);
    }
    const gap = complete?.(result.data);
    if (gap) {
      await ctx.ledger.issue(label, "warning", inputRef, `${result.model} gave an incomplete answer (${gap}); asking again`);
      result = await ctx.gateway.generate(role, { ...req, user: `${req.user}\n\nYour previous answer was incomplete: ${gap}. Answer again, in full.` });
      const still = complete?.(result.data);
      if (still) throw new Error(`${label}: the model's answer is incomplete (${still}), so this step cannot be trusted. Try again, or use a stronger model.`);
    }
    await ctx.db
      .insert(llmCache)
      .values({ key, model: result.model, promptVersion, responseJson: JSON.stringify(result.data) })
      .onConflictDoUpdate({ target: llmCache.key, set: { model: result.model, responseJson: JSON.stringify(result.data) } });
    await ctx.ledger.finish(runId, "ok", { model: result.model, cacheHit: false, usage: result.usage });
    return { data: result.data, model: result.model, cacheHit: false, usage: result.usage };
  } catch (err) {
    await ctx.ledger.finish(runId, "failed", {}, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
