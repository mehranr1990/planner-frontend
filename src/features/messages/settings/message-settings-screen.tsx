"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { MessagingSettings } from "@/data/messaging-domain";
import { useBlockedPeople, useMessagingMutation, useMessagingSettings } from "@/data/messaging-queries";
import { PersonAvatar } from "../visuals";

/*
 * MS-09 · /messages/settings: privacy (read receipts in direct messages —
 * reciprocal; last seen and online — "Nobody" hides both ways; typing; who
 * can DM me), notifications (direct + mentions notify, others badge only;
 * quiet hours = mentions only, badge still counts), link previews default
 * and the blocked list. Presence is ephemeral and never stored as history.
 */

function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 rounded-[22px] bg-surface p-4 shadow-island">
      <h2 id={id} className="text-sm font-bold">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function MessageSettingsScreen() {
  const t = useTranslations("Msg.settings");
  const settings = useMessagingSettings();
  const blocked = useBlockedPeople();
  const save = useMessagingMutation((repo, patch: Partial<MessagingSettings>) => repo.settings.set(patch));
  const unblock = useMessagingMutation((repo, id: string) => repo.settings.unblock(id));
  if (settings.isPending) return <AccessLoading />;
  if (settings.isError) return <AccessState kind="error" />;
  const s = settings.data;
  const set = (patch: Partial<MessagingSettings>) => save.mutate(patch, { onSuccess: () => toast({ title: t("saved") }) });
  const audience = (value: MessagingSettings["lastSeen"], onChange: (v: MessagingSettings["lastSeen"]) => void, label: string) => (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <Select aria-label={label} value={value} onValueChange={(v) => onChange(v as MessagingSettings["lastSeen"])} className="w-44">
        {(["everyone", "contacts", "nobody"] as const).map((o) => (
          <SelectItem key={o} value={o}>
            {t(`audience.${o}`)}
          </SelectItem>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="type-display">{t("title")}</h1>
      <div className="grid gap-4 xl:grid-cols-2">
        <Group id="msg-privacy" title={t("privacy")}>
          <Switch label={t("receiptsDm")} description={t("receiptsHint")} checked={s.receiptsDirect} onCheckedChange={(on) => set({ receiptsDirect: on })} />
          <p className="text-xs text-fg-secondary">{t("receiptsGroups")}</p>
          {audience(s.lastSeen, (v) => set({ lastSeen: v }), t("lastSeen"))}
          {audience(s.online, (v) => set({ online: v }), t("online"))}
          <p className="text-xs text-fg-secondary">{t("presenceHint")}</p>
          <Switch label={t("typing")} checked={s.typing} onCheckedChange={(on) => set({ typing: on })} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{t("whoCanDm")}</span>
            <Select aria-label={t("whoCanDm")} value={s.whoCanDm} onValueChange={(v) => set({ whoCanDm: v as MessagingSettings["whoCanDm"] })} className="w-64">
              {(["connections-and-workspaces", "workspaces", "nobody"] as const).map((o) => (
                <SelectItem key={o} value={o}>
                  {t(`dm.${o}`)}
                </SelectItem>
              ))}
            </Select>
          </div>
        </Group>
        <Group id="msg-notifications" title={t("notifications")}>
          <Switch label={t("notifyDirect")} checked={s.notifyDirect} onCheckedChange={(on) => set({ notifyDirect: on })} />
          <Switch label={t("notifyMentions")} checked={s.notifyMentions} onCheckedChange={(on) => set({ notifyMentions: on })} />
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{t("notifyOther")}</span>
            <Select aria-label={t("notifyOther")} value={s.notifyOther} onValueChange={(v) => set({ notifyOther: v as MessagingSettings["notifyOther"] })} className="w-44">
              <SelectItem value="badge">{t("other.badge")}</SelectItem>
              <SelectItem value="none">{t("other.none")}</SelectItem>
            </Select>
          </div>
          <Switch label={t("quiet")} description={t("quietHint")} checked={s.quietHours.enabled} onCheckedChange={(on) => set({ quietHours: { ...s.quietHours, enabled: on } })} />
          {s.quietHours.enabled ? (
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-xs font-semibold">
                {t("quietFrom")}
                <Input type="time" dir="ltr" value={s.quietHours.from} onChange={(e) => e.target.value && set({ quietHours: { ...s.quietHours, from: e.target.value } })} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                {t("quietTo")}
                <Input type="time" dir="ltr" value={s.quietHours.to} onChange={(e) => e.target.value && set({ quietHours: { ...s.quietHours, to: e.target.value } })} />
              </label>
            </div>
          ) : null}
          <Switch label={t("linkPreviews")} description={t("linkPreviewsHint")} checked={s.linkPreviewsDefault} onCheckedChange={(on) => set({ linkPreviewsDefault: on })} />
        </Group>
        <Group id="msg-blocked" title={t("blocked")}>
          {blocked.data?.length ? (
            <ul className="flex flex-col gap-1">
              {blocked.data.map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-2xl p-1.5">
                  <PersonAvatar person={p} />
                  <bdi className="flex-1 text-sm font-semibold">{p.name}</bdi>
                  <Button size="sm" variant="secondary" onClick={() => unblock.mutate(p.id)}>
                    {t("unblock")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-secondary">{t("noBlocked")}</p>
          )}
          <p className="text-xs text-fg-secondary">{t("blockHint")}</p>
        </Group>
      </div>
    </div>
  );
}
