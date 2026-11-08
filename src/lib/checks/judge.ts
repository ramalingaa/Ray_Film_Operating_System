/**
 * The judge agent: decides whether a code-generated candidate is a real
 * conflict. Runs on one model or a cross-model ensemble, caches every verdict,
 * and only lets a candidate through at or above the confidence threshold.
 */
import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { runAgent, type Agent, type AgentContext } from "../agents/runtime";
import { llmCache } from "../db/schema";
import { JUDGE_PROMPT_VERSION, JUDGE_SYSTEM, judgeUserPrompt } from "../extract/prompts";
import type { Env } from "../llm/gateway";
import type { JudgeCandidate, JudgedCheck } from "./types";

export const VerdictSchema = z.object({
  conflict: z.boolean(),
  confidence: z.number().describe("0 to 1"),
  reason: z.string().describe("One sentence a writer would understand"),
});
export type Verdict = z.infer<typeof VerdictSchema>;

export type JudgePolicy = "primary" | "majority" | "unanimous";

export interface JudgeSettings {
  policy: JudgePolicy;
  threshold: number;
}

export function judgeSettingsFromEnv(env: Env = process.env): JudgeSettings {
  const policy = (env.JUDGE_POLICY ?? "primary") as JudgePolicy;
  if (!["primary", "majority", "unanimous"].includes(policy)) throw new Error(`JUDGE_POLICY must be primary, majority or unanimous (got "${policy}")`);
  const threshold = env.JUDGE_CONFIDENCE_THRESHOLD ? Number(env.JUDGE_CONFIDENCE_THRESHOLD) : 0.7;
  if (!(threshold >= 0 && threshold <= 1)) throw new Error("JUDGE_CONFIDENCE_THRESHOLD must be between 0 and 1");
  return { policy, threshold };
}

export interface Vote extends Verdict {
  model: string;
}

export interface Decision {
  accepted: boolean;
  confidence: number;
  reason: string;
  votes: Vote[];
}

/** Combine votes under a policy. Confidence is clamped to [0, 1]. */
export function decide(votes: Vote[], settings: JudgeSettings): Decision {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  const yes = votes.filter((v) => v.conflict && clamp(v.confidence) >= settings.threshold);
  let accepted: boolean;
  if (votes.length === 0) accepted = false;
  else if (settings.policy === "primary") accepted = yes.length === 1 && yes[0] === votes[0];
  else if (settings.policy === "unanimous") accepted = yes.length === votes.length;
  else accepted = yes.length * 2 > votes.length;

  const basis = accepted ? yes : votes;
  const confidence = basis.length ? Math.min(...basis.map((v) => clamp(v.confidence))) : 0;
  const reason = (accepted ? yes[0] : (votes.find((v) => !v.conflict) ?? votes[0]))?.reason ?? "no verdict";
  return { accepted, confidence, reason, votes };
}

interface JudgeInput {
  check: JudgedCheck;
  candidate: JudgeCandidate;
  settings: JudgeSettings;
}

function verdictKey(model: string, checkId: string, prompt: string): string {
  return crypto.createHash("sha256").update(`${JUDGE_PROMPT_VERSION}\u0000${model}\u0000${checkId}\u0000${prompt}`).digest("hex");
}

/**
 * Asks the judge model(s). Under "primary", the first model that answers
 * decides (later models are fallbacks). Under "majority" / "unanimous", every
 * configured model votes; a model that fails to answer is logged and left out.
 */
export const candidateJudge: Agent<JudgeInput, Decision> = {
  name: "judge",
  version: JUDGE_PROMPT_VERSION,
  async run({ check, candidate, settings }, ctx) {
    if (!ctx.gateway) throw new Error("judge needs a model gateway");
    const prompt = judgeUserPrompt(check.question, candidate.evidence);
    const specs = ctx.gateway.specs("judge");
    const votes: Vote[] = [];
    let anyLive = false;

    for (const model of specs) {
      const key = verdictKey(model, check.id, prompt);
      const [cached] = await ctx.db.select().from(llmCache).where(eq(llmCache.key, key));
      const parsedCache = cached ? VerdictSchema.safeParse(JSON.parse(cached.responseJson)) : undefined;
      if (parsedCache?.success) {
        votes.push({ ...parsedCache.data, model });
      } else {
        try {
          const r = await ctx.gateway.generateWith(model, { system: JUDGE_SYSTEM, user: prompt, schema: VerdictSchema, schemaName: "verdict", maxTokens: 2000 });
          anyLive = true;
          await ctx.db
            .insert(llmCache)
            .values({ key, model, promptVersion: JUDGE_PROMPT_VERSION, responseJson: JSON.stringify(r.data) })
            .onConflictDoUpdate({ target: llmCache.key, set: { responseJson: JSON.stringify(r.data) } });
          votes.push({ ...r.data, model });
        } catch (err) {
          await ctx.ledger.issue("judge", "warning", `${check.id} ${candidate.sceneNumbers.join(",")}`, `${model} gave no verdict: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
      }
      if (settings.policy === "primary") break;
    }
    if (votes.length === 0) throw new Error(`no judge model returned a verdict for ${check.id} [${candidate.sceneNumbers.join(",")}]`);
    if (settings.policy === "unanimous" && votes.length < specs.length) {
      await ctx.ledger.issue("judge", "warning", `${check.id} ${candidate.sceneNumbers.join(",")}`, `only ${votes.length} of ${specs.length} judges answered; unanimity is over those that did`);
    }
    return { output: decide(votes, settings), outcome: { model: votes.map((v) => v.model).join("+"), cacheHit: !anyLive } };
  },
};

export async function judge(ctx: AgentContext, check: JudgedCheck, candidate: JudgeCandidate, settings: JudgeSettings): Promise<Decision | undefined> {
  try {
    return await runAgent(candidateJudge, { check, candidate, settings }, ctx, `${check.id}#${candidate.sceneNumbers.join(",")}`);
  } catch {
    return undefined; // already recorded as a failed run + error issue
  }
}
