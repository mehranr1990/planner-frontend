import { typedAs, type ApiClient } from "@/api/client";
import type { paths } from "@/api/generated/openapi-p6-projects";
import { RepositoryError } from "../repositories";

/*
 * Retention (OD-1 / R1): creating a Space needs a `retentionPolicyVersion`
 * from the operator-approved catalog (`GET /retention-policies?context=`).
 * No screen offers a policy choice, so a creation uses the catalog's policy
 * only when exactly one applies; an empty catalog or several candidates are
 * refused truthfully (never a guessed version). The server still checks the
 * version, Shared activation and every guard.
 */

export type RetentionContext = "PROJECT" | "TEAM" | "COMPANY" | "CONVERSATION" | "MEETING" | "SOCIAL_GROUP";

export async function catalogVersion(client: ApiClient, context: RetentionContext): Promise<string> {
  const { data } = await typedAs<paths>(client).request("get", "/api/v1/retention-policies", { query: { context } });
  const policies = data.items.filter((policy) => policy.applicableContexts.includes(context));
  if (policies.length === 0) throw new RepositoryError("unsupported", `No approved retention policy for ${context.toLowerCase()} yet (operator catalog)`);
  if (policies.length > 1) throw new RepositoryError("unsupported", `Several retention policies apply to ${context.toLowerCase()}; choosing one needs a policy picker`);
  return policies[0]!.version;
}
