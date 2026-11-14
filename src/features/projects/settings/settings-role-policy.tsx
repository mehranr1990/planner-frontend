"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AccessLoading } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/components/ui/toast";
import {
  POLICY_CAPABILITIES,
  withinPolicyCeiling,
  type PolicyCapability,
  type PolicyRole,
  type ProjectRolePolicy,
} from "@/data/project-domain";
import { useRolePolicy, useSetRolePolicy } from "@/data/project-queries";
import { useProjectFormat } from "../format";
import { useProjectLabels } from "../labels";
import { useSettingsError } from "./settings-shared";

/*
 * PJ-14 › Access in live mode (owner gap closure 2026-11-14): the server keeps
 * the access policy as versioned role defaults, so the tab shows that matrix
 * instead of the mock toggles. Each box is one ordinary capability for one
 * role; boxes above the server ceiling (Viewers: read / export / files only;
 * Members: no task delete or workflow publish) are locked, never offered.
 * Saving publishes a new policy version with If-Match on the version shown; a
 * stale version answers "conflict" and the matrix reloads. Export limits are
 * shown as served and sent back unchanged.
 */

const ROLES: readonly PolicyRole[] = ["owner", "admin", "manager", "member", "viewer"];

type Defaults = ProjectRolePolicy["roleDefaults"];

const CAP_KEY = {
  "task.read": "rolePolicy.caps.task_read",
  "task.create": "rolePolicy.caps.task_create",
  "task.update": "rolePolicy.caps.task_update",
  "task.complete": "rolePolicy.caps.task_complete",
  "task.delete": "rolePolicy.caps.task_delete",
  "assignment.accept": "rolePolicy.caps.assignment_accept",
  "assignment.decline": "rolePolicy.caps.assignment_decline",
  "assignment.assign": "rolePolicy.caps.assignment_assign",
  "workflow.transition": "rolePolicy.caps.workflow_transition",
  "workflow.publish": "rolePolicy.caps.workflow_publish",
  "export.visible": "rolePolicy.caps.export_visible",
  "file.read": "rolePolicy.caps.file_read",
} as const satisfies Record<PolicyCapability, string>;

export function RolePolicyPanel({ projectId, canEdit }: { projectId: string; canEdit: boolean }) {
  const t = useTranslations("ProjectSettings");
  const policy = useRolePolicy(projectId, true);
  if (policy.isError) return <InlineAlert tone="info" title={t("accessUnavailable")} />;
  if (!policy.data) return <AccessLoading />;
  return <RolePolicyMatrix key={policy.data.version} projectId={projectId} policy={policy.data} canEdit={canEdit} />;
}

function RolePolicyMatrix({ projectId, policy, canEdit }: { projectId: string; policy: ProjectRolePolicy; canEdit: boolean }) {
  const t = useTranslations("ProjectSettings");
  const labels = useProjectLabels();
  const format = useProjectFormat();
  const save = useSetRolePolicy(projectId);
  const onError = useSettingsError();
  const [draft, setDraft] = useState<Defaults>(policy.roleDefaults);
  const dirty = ROLES.some(
    (role) => draft[role].length !== policy.roleDefaults[role].length || draft[role].some((cap) => !policy.roleDefaults[role].includes(cap)),
  );
  const toggle = (role: PolicyRole, capability: PolicyCapability, on: boolean) =>
    setDraft((current) => ({
      ...current,
      // Keep the catalogue order so the request stays stable.
      [role]: POLICY_CAPABILITIES.filter((cap) => (cap === capability ? on : current[role].includes(cap))),
    }));

  return (
    <div className="flex flex-col gap-3">
      <InlineAlert tone="info" title={t("rolePolicy.title")} description={t("rolePolicy.hint")} />
      {!canEdit ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <div className="overflow-x-auto rounded-card border border-hairline">
        <table className="w-full min-w-[34rem] text-sm">
          <caption className="sr-only">{t("rolePolicy.title")}</caption>
          <thead>
            <tr className="border-b border-hairline text-xs font-semibold text-fg-secondary">
              <th scope="col" className="px-3 py-2 text-start">
                {t("rolePolicy.capability")}
              </th>
              {ROLES.map((role) => (
                <th key={role} scope="col" className="px-2 py-2 text-center">
                  {labels.role(role)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {POLICY_CAPABILITIES.map((capability) => (
              <tr key={capability} className="border-b border-hairline last:border-b-0">
                <th scope="row" className="px-3 py-2 text-start font-medium text-fg">
                  {t(CAP_KEY[capability])}
                </th>
                {ROLES.map((role) => {
                  const allowed = withinPolicyCeiling(role, capability);
                  const name = `${labels.role(role)} · ${t(CAP_KEY[capability])}`;
                  return (
                    <td key={role} className="px-2 py-2 text-center">
                      <span className="inline-flex justify-center">
                        <Checkbox
                          aria-label={allowed ? name : `${name} — ${t("rolePolicy.ceiling")}`}
                          checked={draft[role].includes(capability)}
                          locked={!allowed}
                          disabled={!canEdit || save.isPending}
                          onCheckedChange={(on) => toggle(role, capability, on === true)}
                        />
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-fg-muted">
        {t("rolePolicy.exportLimits", { records: format.number(policy.exportMaxRecords), megabytes: format.number(Math.round((policy.exportMaxBytes / 1_048_576) * 10) / 10) })}
      </p>
      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty || save.isPending} onClick={() => setDraft(policy.roleDefaults)}>
            {t("rolePolicy.reset")}
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate({ roleDefaults: draft, version: policy.version }, { onSuccess: () => toast({ title: t("saved") }), onError })
            }
          >
            {t("rolePolicy.save")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
