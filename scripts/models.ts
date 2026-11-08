import type { ModelGateway, Role } from "@/lib/llm/gateway";
import { availableGateway } from "@/lib/llm/available";

/** The gateway for `roles`, or undefined with a warning (callers then run deterministic steps only). */
export function gatewayFor(roles: Role[]): ModelGateway | undefined {
  if (process.argv.includes("--no-models")) return undefined;
  const { gateway, reason } = availableGateway(roles);
  if (!gateway) console.warn(`! models unavailable (${reason}); running deterministic steps only`);
  return gateway;
}
