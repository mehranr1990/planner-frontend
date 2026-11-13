import { newIdempotencyKey, type ApiClient } from "@/api/client";
import type { CustomField, CustomFieldType } from "../project-domain";
import type { FieldRepository } from "../project-repositories";
import { RepositoryError } from "../repositories";
import { mapErrors, pageAll, retryOnConflict, revisionTag, unsupported } from "./api-shared";
import { conflictAware, projectsClient, projectViewItems, type ProjectsData, type ProjectsClient } from "./api-project-shared";

/*
 * Settings › Fields over `…/custom-fields` and their immutable versions.
 * - Fields apply to tasks only; the API enforces no "required", so `required`
 *   is false and a required field is refused on save.
 * - `valueCount` counts non-null values on every LIST page.
 * - Kinds map 1:1 (BOOLEAN = checkbox). CURRENCY has no screen type and is not
 *   listed; "url" is refused on save (it would come back as plain text).
 * - Saving creates a field or publishes a new version of a changed one;
 *   fields left out of the list are untouched (removal = `remove`, a deprecation).
 */

type ApiField = ProjectsData<"/api/v1/projects/{projectId}/custom-fields", "get">["items"][number];
type ApiVersion = ProjectsData<"/api/v1/projects/{projectId}/custom-fields/{fieldId}/versions", "get">;
type ApiKind = ApiField["kind"];
type Definition = { name: string; kind: ApiKind; limits?: NonNullable<ApiVersion["limits"]>; options?: NonNullable<ApiVersion["options"]> };

const TYPE_OF: Partial<Record<ApiKind, CustomFieldType>> = {
  TEXT: "text",
  NUMBER: "number",
  DATE: "date",
  BOOLEAN: "checkbox",
  SINGLE_SELECT: "single-select",
  MULTI_SELECT: "multi-select",
  PERSON: "person",
};
const KIND_OF = Object.fromEntries(Object.entries(TYPE_OF).map(([kind, type]) => [type, kind])) as Partial<Record<CustomFieldType, ApiKind>>;
const READS = 8;

const activeFields = async (api: ProjectsClient, projectId: string): Promise<ApiField[]> =>
  (
    await pageAll<ApiField>(async (after) => (await api.request("get", "/api/v1/projects/{projectId}/custom-fields", { path: { projectId }, query: { limit: 100, after } })).data)
  ).filter((field) => field.deprecatedAt === null);

const version = async (api: ProjectsClient, projectId: string, field: ApiField): Promise<ApiVersion> =>
  (await api.request("get", "/api/v1/projects/{projectId}/custom-fields/{fieldId}/versions", { path: { projectId, fieldId: field.id }, query: { version: field.currentVersion } })).data;

const numberOrUndefined = (value: string | undefined) => (value === undefined || value === "" ? undefined : Number(value));

const toField = (field: ApiField, current: ApiVersion, valueCount: number): CustomField => ({
  id: field.id,
  name: current.name,
  type: TYPE_OF[current.kind]!,
  ...(current.options ? { options: current.options.map((option) => option.label) } : {}),
  ...(numberOrUndefined(current.limits?.minimum) !== undefined ? { min: numberOrUndefined(current.limits?.minimum) } : {}),
  ...(numberOrUndefined(current.limits?.maximum) !== undefined ? { max: numberOrUndefined(current.limits?.maximum) } : {}),
  appliesTo: ["tasks"],
  required: false,
  valueCount,
});

/** The API definition for a seam field; option ids are kept per label. */
function toDefinition(field: Omit<CustomField, "id" | "valueCount">, before?: ApiVersion): Definition {
  const kind = KIND_OF[field.type];
  if (!kind) unsupported(`The API has no "${field.type}" field kind`);
  if (field.required) unsupported("The API does not enforce required fields");
  if (field.appliesTo.some((target) => target !== "tasks")) unsupported("Custom fields apply to tasks only");
  const limits = field.type === "number" && (field.min !== undefined || field.max !== undefined)
    ? { ...(field.min !== undefined ? { minimum: String(field.min) } : {}), ...(field.max !== undefined ? { maximum: String(field.max) } : {}) }
    : undefined;
  const options = field.type === "single-select" || field.type === "multi-select"
    ? (field.options ?? []).map((label) => ({ id: before?.options?.find((option) => option.label === label)?.id ?? crypto.randomUUID(), label }))
    : undefined;
  return { name: field.name.trim(), kind, ...(limits ? { limits } : {}), ...(options ? { options } : {}) };
}

const sameDefinition = (a: Definition, b: Definition) =>
  a.name === b.name &&
  a.kind === b.kind &&
  JSON.stringify(a.limits ?? {}) === JSON.stringify(b.limits ?? {}) &&
  JSON.stringify((a.options ?? []).map((option) => option.label)) === JSON.stringify((b.options ?? []).map((option) => option.label));

export function createApiProjectFieldRepository(client: ApiClient): FieldRepository {
  const api = projectsClient(client);

  const list = async (projectId: string): Promise<CustomField[]> => {
    const [fields, items] = await Promise.all([activeFields(api, projectId), projectViewItems(api, projectId)]);
    const counts = new Map<string, number>();
    for (const item of items) for (const value of item.fields.items) if (value.value !== null) counts.set(value.fieldId, (counts.get(value.fieldId) ?? 0) + 1);
    const shown = fields.filter((field) => TYPE_OF[field.kind]);
    const out: CustomField[] = [];
    for (let at = 0; at < shown.length; at += READS) {
      const batch = shown.slice(at, at + READS);
      const versions = await Promise.all(batch.map((field) => version(api, projectId, field)));
      out.push(...batch.map((field, index) => toField(field, versions[index]!, counts.get(field.id) ?? 0)));
    }
    return out;
  };

  const find = async (projectId: string, fieldId: string): Promise<ApiField> => {
    const found = (await activeFields(api, projectId)).find((candidate) => candidate.id === fieldId);
    if (!found) throw new RepositoryError("not-found", "Not found");
    return found;
  };

  return {
    list: (projectId) => mapErrors(() => list(projectId)),

    save: (projectId, fields) =>
      mapErrors(async () => {
        if (fields.some((field) => !field.name.trim())) throw new RepositoryError("invalid", "field-name");
        for (const field of fields) {
          if (!field.id) {
            await api.request("post", "/api/v1/projects/{projectId}/custom-fields", {
              path: { projectId },
              header: { "Idempotency-Key": newIdempotencyKey() },
              body: { id: crypto.randomUUID(), ...toDefinition(field) },
            });
            continue;
          }
          let current = await find(projectId, field.id);
          const before = await version(api, projectId, current);
          const next = toDefinition(field, before);
          if (sameDefinition(next, before)) continue;
          const send = () =>
            api.request("post", "/api/v1/projects/{projectId}/custom-fields/{fieldId}/versions", {
              path: { projectId, fieldId: current.id },
              header: { "If-Match": revisionTag(current.revision), "Idempotency-Key": newIdempotencyKey() },
              body: next,
            });
          await conflictAware(() => retryOnConflict(send, async () => (current = await find(projectId, current.id))));
        }
        return list(projectId);
      }),

    // The API never deletes a field: it is deprecated (kept on old values, offered nowhere).
    remove: (projectId, fieldId) =>
      mapErrors(async () => {
        const all = await pageAll<ApiField>(
          async (after) => (await api.request("get", "/api/v1/projects/{projectId}/custom-fields", { path: { projectId }, query: { limit: 100, after } })).data,
        );
        let current = all.find((candidate) => candidate.id === fieldId);
        if (!current) throw new RepositoryError("not-found", "Not found");
        if (current.deprecatedAt) return;
        const send = () =>
          api.request("post", "/api/v1/projects/{projectId}/custom-fields/{fieldId}/deprecate", { path: { projectId, fieldId }, header: { "If-Match": revisionTag(current!.revision) } });
        await conflictAware(() => retryOnConflict(send, async () => (current = await find(projectId, fieldId))));
      }),
  };
}
