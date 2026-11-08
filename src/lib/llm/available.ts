import { ModelGateway, type Env, type Role } from "./gateway";
import { ModelConfigError } from "./types";

/**
 * The gateway from env if every model configured for `roles` can be
 * constructed; otherwise no gateway plus the reason (callers then run their
 * deterministic steps only and say so).
 */
export function availableGateway(roles: Role[], env: Env = process.env): { gateway?: ModelGateway; reason?: string } {
  const gateway = ModelGateway.fromEnv(env);
  try {
    for (const role of roles) for (const spec of gateway.specs(role)) gateway.adapter(spec);
    return { gateway };
  } catch (err) {
    if (!(err instanceof ModelConfigError)) throw err;
    return { reason: err.message };
  }
}
