"use client";

import { useTranslations } from "next-intl";
import { AccessLoading } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { InviteRole, ProjectAccessSettings } from "@/data/project-domain";
import { useAccessSettings, useSettingsActions } from "@/data/project-queries";
import { useProjectLabels } from "../labels";
import { useProject } from "../project-gate";
import { SettingRow, useSettingsError } from "./settings-shared";
import { RolePolicyPanel } from "./settings-role-policy";

/*
 * PJ-14 › Access (Admin+): default invite role, allow guests, guest grant
 * default expiry, Members may invite (Viewers). Values come from the
 * server; the OPEN items (expiry, Members may invite) use the SPEC defaults
 * as mock config. "Viewers can comment" is not offered: the owner resolved
 * that Viewers may not comment (DECISIONS › RESOLVED BY OWNER).
 */

const ROLES: readonly InviteRole[] = ["admin", "manager", "member", "viewer"];

export function AccessTab() {
  const t = useTranslations("ProjectSettings");
  const labels = useProjectLabels();
  const { project, capabilities } = useProject();
  const access = useAccessSettings(project.id);
  const actions = useSettingsActions(project.id);
  const onError = useSettingsError();
  // Live: the toggles are not served; the server policy is role defaults (RolePolicyPanel).
  if (access.isError) return <RolePolicyPanel projectId={project.id} canEdit={capabilities.editAccess} />;
  if (!access.data) return <AccessLoading />;
  const value = access.data;
  const canEdit = capabilities.editAccess;
  const set = (patch: Partial<ProjectAccessSettings>) => actions.setAccess.mutate(patch, { onError });
  return (
    <div className="flex flex-col gap-2">
      {!canEdit ? <InlineAlert tone="info" title={t("readOnly")} /> : null}
      <SettingRow title={t("access.defaultRole")} hint={t("access.defaultRoleHint")}>
        <Select
          aria-label={t("access.defaultRole")}
          value={value.defaultInviteRole}
          disabled={!canEdit}
          onValueChange={(role) => set({ defaultInviteRole: role as InviteRole })}
          className="h-9 w-36"
        >
          {ROLES.map((role) => (
            <SelectItem key={role} value={role}>
              {labels.role(role)}
            </SelectItem>
          ))}
        </Select>
      </SettingRow>
      <SettingRow title={t("access.allowGuests")} hint={t("access.allowGuestsHint")}>
        <Switch
          aria-label={t("access.allowGuests")}
          checked={value.allowGuests}
          disabled={!canEdit}
          onCheckedChange={(on) => set({ allowGuests: on })}
        />
      </SettingRow>
      <SettingRow title={t("access.grantExpiry")} hint={t("access.grantExpiryHint")}>
        <label className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Input
            type="number"
            min={1}
            dir="ltr"
            aria-label={t("access.grantExpiry")}
            defaultValue={value.guestGrantDays}
            disabled={!canEdit || !value.allowGuests}
            onBlur={(event) => {
              const n = Number(event.target.value);
              if (Number.isInteger(n) && n > 0 && n !== value.guestGrantDays) set({ guestGrantDays: n });
            }}
            className="h-9 w-20"
          />
          <span aria-hidden="true">{t("access.days", { n: "" }).trim()}</span>
        </label>
      </SettingRow>
      <SettingRow title={t("access.membersInvite")} hint={t("access.membersInviteHint")}>
        <Switch
          aria-label={t("access.membersInvite")}
          checked={value.membersInviteViewers}
          disabled={!canEdit}
          onCheckedChange={(on) => set({ membersInviteViewers: on })}
        />
      </SettingRow>
    </div>
  );
}
