import { typedAs, type ApiClient } from "@/api/client";
import { ApiHttpError, hasApiReason, SHARED_NOT_ENABLED_CODES } from "@/api/errors";
import type { paths } from "@/api/generated/openapi-p6-projects";
import { RepositoryError } from "../repositories";

/*
 * Retention (OD-1 / R1, catalog v2): creating a Space needs a
 * `retentionPolicyVersion` from the operator-approved catalog
 * (`GET /retention-policies?context=`). The catalog lists every stored
 * version (immutable v1.x rows stay next to v2.0), so a creation uses the
 * single policy of the newest catalog generation the server returns for the
 * context; nothing is hardcoded. No screen offers a policy choice, so several
 * candidates of the same generation are refused (never a guessed version).
 * The server still checks the version, Shared activation and every guard.
 *
 * Refusals carry the activation codes as their message so every create form
 * can say "not enabled yet" instead of a user error:
 * - the catalog needs only a verified session, so a 403 there is the Shared
 *   activation gate (SHARED_ACTIVATION_GATED);
 * - an empty catalog means no approved policy (SHARED_RETENTION_UNAVAILABLE).
 */

export type RetentionContext = "PROJECT" | "TEAM" | "COMPANY" | "CONVERSATION" | "MEETING" | "SOCIAL_GROUP";

export const SHARED_ACTIVATION_GATED = "SHARED_ACTIVATION_GATED";
export const SHARED_RETENTION_UNAVAILABLE = "SHARED_RETENTION_UNAVAILABLE";

/** `mp-rpc-v2.0-work` → [2, 0]; versions outside that naming rank lowest. */
const generation = (version: string): [number, number] => {
  const match = /^mp-rpc-v(\d+)\.(\d+)-/.exec(version);
  return match ? [Number(match[1]), Number(match[2])] : [-1, -1];
};
const compare = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];

/** The current catalog policies for `context`: the newest generation among the applicable versions the server returned. */
export function currentPolicies<T extends { version: string; applicableContexts: readonly string[] }>(items: readonly T[], context: RetentionContext): T[] {
  const applicable = items.filter((policy) => policy.applicableContexts.includes(context));
  const newest = applicable.reduce<[number, number] | null>((top, policy) => {
    const g = generation(policy.version);
    return top && compare(top, g) >= 0 ? top : g;
  }, null);
  return newest ? applicable.filter((policy) => compare(generation(policy.version), newest) === 0) : [];
}

export async function catalogVersion(client: ApiClient, context: RetentionContext): Promise<string> {
  let items: paths["/api/v1/retention-policies"]["get"]["responses"]["200"]["content"]["application/json"]["items"];
  try {
    ({ data: { items } } = await typedAs<paths>(client).request("get", "/api/v1/retention-policies", { query: { context } }));
  } catch (error) {
    if (hasApiReason(error, SHARED_NOT_ENABLED_CODES) || (error instanceof ApiHttpError && error.status === 403))
      throw new RepositoryError("unsupported", hasApiReason(error, [SHARED_RETENTION_UNAVAILABLE]) ? SHARED_RETENTION_UNAVAILABLE : SHARED_ACTIVATION_GATED);
    throw error;
  }
  const policies = currentPolicies(items, context);
  if (policies.length === 0) throw new RepositoryError("unsupported", SHARED_RETENTION_UNAVAILABLE);
  if (policies.length > 1) throw new RepositoryError("unsupported", `Several retention policies apply to ${context.toLowerCase()}; choosing one needs a policy picker`);
  return policies[0]!.version;
}
