import { ModelGateway, type Role } from "@/lib/llm/gateway";
import { ModelConfigError } from "@/lib/llm/types";

/**
 * The gateway if every model configured for `roles` can be constructed, else
 * undefined with a warning (callers then fall back to deterministic work).
 */
export function gatewayFor(roles: Role[]): ModelGateway | undefined {
  if (process.argv.includes("--no-models")) return undefined;
  const gateway = ModelGateway.fromEnv();
  try {
    for (const role of roles) for (const spec of gateway.specs(role)) gateway.adapter(spec);
    return gateway;
  } catch (err) {
    if (!(err instanceof ModelConfigError)) throw err;
    console.warn(`! models unavailable (${err.message}); running deterministic steps only`);
    return undefined;
  }
}
