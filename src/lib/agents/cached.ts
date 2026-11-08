/**
 * A structured model call whose answer is cached in `llm_cache` under
 * hash(prompt version + model list + input). Re-running a stage on the same
 * input costs nothing.
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

export async function cachedGenerate<T>(ctx: AgentContext, role: Role, promptVersion: string, req: StructuredRequest<T>, label: string): Promise<CachedResult<T>> {
  if (!ctx.gateway) throw new Error(`${label} needs a model (none configured)`);
  const models = ctx.gateway.specs(role);
  const key = crypto.createHash("sha256").update(`${promptVersion}\u0000${models.join(",")}\u0000${req.system}\u0000${req.user}`).digest("hex");

  const [cached] = await ctx.db.select().from(llmCache).where(eq(llmCache.key, key));
  if (cached) {
    const parsed = req.schema.safeParse(JSON.parse(cached.responseJson));
    if (parsed.success) return { data: parsed.data, model: cached.model, cacheHit: true };
    await ctx.ledger.issue(label, "warning", label, "cached answer no longer matches the schema; asking again");
  }

  const result = await ctx.gateway.generate(role, req);
  for (const a of result.attempts.filter((a) => a.outcome !== "ok")) {
    await ctx.ledger.issue(label, "warning", label, `${a.model}: ${a.outcome} (${a.message})`);
  }
  await ctx.db
    .insert(llmCache)
    .values({ key, model: result.model, promptVersion, responseJson: JSON.stringify(result.data) })
    .onConflictDoUpdate({ target: llmCache.key, set: { model: result.model, responseJson: JSON.stringify(result.data) } });
  return { data: result.data, model: result.model, cacheHit: false, usage: result.usage };
}
