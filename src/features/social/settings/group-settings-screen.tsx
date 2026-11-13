"use client";

import { CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { GroupDetail, GroupSettings, SocialCurrency } from "@/data/social-domain";
import { useLeaveChecklist, useSocialMutation } from "@/data/social-queries";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { useSocialGroup } from "../social-gate";
import { SocialPageHeader, SocialUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * SO-14 · Group settings & leave (/social/groups/[id]/settings?tab=…).
 * Folder tabs General · Members · Leave. General: visibility (owner only),
 * invites, expense approvers (S4), balance visibility (S5), original photo
 * downloads, currency (locked after the first approved expense). Leave:
 * checklist (open balance, things held, my photos — remove before leaving),
 * access revoked immediately, approved records remain; the owner must
 * transfer ownership first (S10); delete only when balances are settled.
 */
export function GroupSettingsScreen() {
  const t = useTranslations("Social.settings");
  const group = useSocialGroup();
  const requested = useSearchParams().get("tab");
  const tab = requested === "members" || requested === "leave" ? requested : "general";
  return (
    <>
      <SocialPageHeader group={group} trail={[{ label: t("title") }]} title={t("title")} />
      <FolderTabsCard
        label={t("tabs.label")}
        defaultValue={tab}
        className="max-w-3xl"
        tabs={[
          { value: "general", label: t("tabs.general"), content: <General key={JSON.stringify(group.settings) + group.name} group={group} /> },
          {
            value: "members",
            label: t("tabs.members"),
            content: (
              <div className="flex flex-col items-start gap-3 p-1">
                <p className="text-sm text-fg-secondary">{t("membersNote")}</p>
                <Button asChild variant="secondary"><Link href={socialHref.group(group.id, "members")}>{t("openMembers")}</Link></Button>
              </div>
            ),
          },
          { value: "leave", label: t("tabs.leave"), content: <Leave group={group} /> },
        ]}
      />
    </>
  );
}

function General({ group }: { group: GroupDetail }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const editable = group.capabilities.editSettings;
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [rules, setRules] = useState(group.rules);
  const [settings, setSettings] = useState<GroupSettings>(group.settings);
  const [currency, setCurrency] = useState<SocialCurrency | null>(group.currency);
  const save = useSocialMutation((repo) => repo.groups.updateSettings(group.id, { ...settings, name, description, rules, ...(currency ? { currency } : {}) }));
  const set = <K extends keyof GroupSettings>(key: K, value: GroupSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  return (
    <form
      className="flex flex-col gap-4 p-1"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(undefined, { onSuccess: () => toast({ title: t("settings.saved"), tone: "success" }) });
      }}
    >
      {!editable ? <InlineAlert tone="info" title={t("settings.readOnly")} /> : null}
      <fieldset disabled={!editable} className="flex flex-col gap-4">
        <Field><FieldLabel>{t("settings.name")}</FieldLabel><Input dir="auto" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field><FieldLabel>{t("settings.description")}</FieldLabel><Textarea dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
        <Field><FieldLabel>{t("settings.rules")}</FieldLabel><Textarea dir="auto" value={rules} onChange={(e) => setRules(e.target.value)} /></Field>
        <fieldset className="flex flex-col gap-2" disabled={!group.capabilities.makeDiscoverable}>
          <legend className="mb-1.5 text-sm font-bold text-fg">{t("settings.visibility")}</legend>
          <RadioGroup value={settings.visibility} onValueChange={(v) => set("visibility", v as GroupSettings["visibility"])}>
            <RadioGroupItem value="private" label={t("sheets.groupNew.private")} />
            <RadioGroupItem value="discoverable" label={t("sheets.groupNew.discoverable")} />
          </RadioGroup>
          <p className="text-xs text-fg-muted">{t("settings.visibilityOwner")}</p>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-bold text-fg">{t("settings.invites")}</legend>
          <RadioGroup value={settings.invites} onValueChange={(v) => set("invites", v as GroupSettings["invites"])}>
            <RadioGroupItem value="admins" label={t("settings.invitesAdmins")} />
            <RadioGroupItem value="members" label={t("settings.invitesMembers")} />
          </RadioGroup>
          <Switch checked={settings.linkNeedsApproval} onCheckedChange={(v) => set("linkNeedsApproval", v)} label={t("settings.linkApproval")} />
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-bold text-fg">{t("settings.approvers")}</legend>
          <RadioGroup value={settings.approvers} onValueChange={(v) => set("approvers", v as GroupSettings["approvers"])}>
            <RadioGroupItem value="admins" label={t("settings.approversAdmins")} />
            <RadioGroupItem value="admins-organiser" label={t("settings.approversOrganiser")} />
          </RadioGroup>
        </fieldset>
        <Switch checked={settings.membersSeeBalances} onCheckedChange={(v) => set("membersSeeBalances", v)} label={t("settings.balances")} />
        <Switch checked={settings.originalsUploaderOnly} onCheckedChange={(v) => set("originalsUploaderOnly", v)} label={t("settings.originals")} />
        <Field>
          <FieldLabel>{t("settings.currency")}</FieldLabel>
          <Select value={currency ?? ""} onValueChange={(v) => setCurrency(v as SocialCurrency)} disabled={group.currencyLocked || !editable || currency === null}>
            {(["toman", "try", "eur"] as const).map((c) => (
              <SelectItem key={c} value={c}>{t(`currencyName.${c}`)}</SelectItem>
            ))}
          </Select>
          <FieldDescription>{group.currencyLocked ? t("settings.currencyLocked") : t("sheets.groupNew.currencyHint")}</FieldDescription>
        </Field>
      </fieldset>
      {save.isError ? <InlineAlert tone="danger" title={errorText(save.error)} /> : null}
      {editable ? <Button type="submit" className="self-start" disabled={save.isPending}>{t("common.save")}</Button> : null}
    </form>
  );
}

function Leave({ group }: { group: GroupDetail }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const router = useRouter();
  const errorText = useSocialErrorText();
  const checklist = useLeaveChecklist(group.id);
  const [removePhotos, setRemovePhotos] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  const [successor, setSuccessor] = useState("");
  const leave = useSocialMutation((repo) => repo.groups.leave(group.id, removePhotos));
  const del = useSocialMutation((repo) => repo.groups.deleteGroup(group.id));
  const transfer = useSocialMutation((repo, personId: string) => repo.groups.transferOwnership(group.id, personId));
  const c = checklist.data;
  if (checklist.isError) return <div className="p-1"><SocialUnsupported compact /></div>;
  if (!c) return null;
  const row = (ok: boolean, text: string, action?: ReactNode) => (
    <li className="flex flex-wrap items-center gap-2 rounded-row bg-subtle px-3 py-2.5">
      <Icon icon={ok ? CircleCheck : CircleAlert} size={16} className={ok ? "text-success-text" : "text-warning-text"} />
      <bdi className="min-w-0 flex-1 text-sm text-fg">{text}</bdi>
      {action}
    </li>
  );
  const others = group.members.filter((m) => !m.isSelf);
  return (
    <div className="flex flex-col gap-4 p-1">
      <h3 className="text-sm font-bold text-fg">{t("settings.checklist")}</h3>
      <ul className="flex flex-col gap-2">
        {row(
          c.openBalance === null,
          c.openBalance ? t("settings.balanceOpen", { amount: format.signed(c.openBalance.net, c.openBalance.currency) }) : t("settings.balanceOk"),
          c.openBalance ? <Button asChild size="sm" variant="secondary"><Link href={socialHref.settle({ kind: "group", id: group.id })}>{t("settings.settleFirst")}</Link></Button> : undefined,
        )}
        {row(c.thingsHeld.length === 0, c.thingsHeld.length ? t("settings.thingsHeld", { things: c.thingsHeld.map((x) => x.name).join(", ") }) : t("settings.thingsOk"))}
        {row(true, t("settings.photos", { count: c.myPhotos, n: format.number(c.myPhotos) }))}
      </ul>
      {c.myPhotos > 0 ? <Checkbox checked={removePhotos} onCheckedChange={(v) => setRemovePhotos(v === true)} label={t("settings.removePhotos")} /> : null}
      <p className="text-sm text-fg-secondary">{t("settings.leaveBody")}</p>
      {c.isOwner ? (
        <div className="flex flex-col gap-3 rounded-row bg-warning-soft p-4">
          <p className="text-sm font-semibold text-warning-text">{t("settings.ownerFirst")}</p>
          <div className="flex flex-wrap items-end gap-2">
            <Field className="min-w-48 flex-1">
              <FieldLabel>{t("settings.transferTo")}</FieldLabel>
              <Select value={successor} onValueChange={setSuccessor} placeholder={t("settings.transferTo")}>
                {others.map((m) => <SelectItem key={m.person.id} value={m.person.id}>{m.person.name}</SelectItem>)}
              </Select>
            </Field>
            <Button
              variant="secondary"
              disabled={!successor || transfer.isPending}
              onClick={() => transfer.mutate(successor, { onSuccess: () => toast({ title: t("settings.transferred", { name: others.find((m) => m.person.id === successor)?.person.name ?? "" }) }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}
            >
              {t("settings.transfer")}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="destructive" className="self-start" aria-haspopup="dialog" onClick={() => setConfirm("leave")}>{t("settings.leave")}</Button>
      )}
      {group.capabilities.deleteGroup ? (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-sm text-fg-secondary">{t("settings.deleteBody")}</p>
          {!c.canDelete ? <p className="text-xs font-semibold text-warning-text">{t("settings.deleteBlocked")}</p> : null}
          <Button variant="ghost" className="self-start text-danger-text" disabled={!c.canDelete} aria-haspopup="dialog" onClick={() => setConfirm("delete")}>{t("settings.delete")}</Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? undefined : setConfirm(null))}
        tone="destructive"
        title={confirm === "delete" ? t("settings.delete") : t("settings.leaveConfirm", { group: group.name })}
        description={confirm === "delete" ? t("settings.deleteBody") : t("settings.leaveBody")}
        confirmLabel={confirm === "delete" ? t("settings.delete") : t("settings.leave")}
        error={leave.isError ? errorText(leave.error) : del.isError ? errorText(del.error) : undefined}
        onConfirm={() =>
          (confirm === "delete" ? del.mutateAsync(undefined) : leave.mutateAsync(undefined)).then(() => {
            toast({ title: confirm === "delete" ? t("settings.deleted") : t("settings.left", { group: group.name }) });
            router.replace(socialHref.home);
          })
        }
      />
    </div>
  );
}
