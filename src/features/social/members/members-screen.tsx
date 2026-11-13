"use client";

import { CircleDot, MessageCircle, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PeopleWorkload, type PeopleWorkloadPerson } from "@/components/context/people-workload";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/toast";
import { getPlannerNow } from "@/data/clock";
import type { GroupDetail, GroupMember, GroupStatus } from "@/data/social-domain";
import { useGroupInvites, useSocialMutation } from "@/data/social-queries";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { useSocialFormat } from "../format";
import { useOpenDirectMessage } from "../group/group-chat";
import { JoinRequestsCard } from "../groups/groups-screen";
import { useSocialGroup } from "../social-gate";
import { PersonAvatar, SocialPageHeader, SocialUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";
import { InviteDialog } from "./invite-dialog";

/*
 * SO-19 · Group members (/social/groups/[id]/members). "Who's around":
 * the shared PeopleWorkload card in status-only mode (PEOPLE_FLOW §1) — no
 * bars, no "now working on", no last seen; status is per group, opt-in and
 * set by the person (Available · Busy · Away + note + clear after). Tabs
 * Members · Requests · Invited. Member signature card: notch Message;
 * admin actions below (owner changes roles; admins remove). No member's
 * connections, circles, balances or other groups are shown; activity
 * guests are not listed.
 */
export function MembersScreen() {
  const t = useTranslations("Social");
  const group = useSocialGroup();
  const format = useSocialFormat();
  const [selectedId, setSelectedId] = useState<string>(group.members.find((m) => m.isSelf)?.person.id ?? group.members[0]!.person.id);
  const [settingStatus, setSettingStatus] = useState(false);
  const [inviting, setInviting] = useState(false);
  const message = useOpenDirectMessage();
  const people: PeopleWorkloadPerson[] = group.members.map((m) => ({
    id: m.person.id,
    name: m.person.name,
    initials: m.person.initials,
    role: t(`roles.${m.role ?? "unknown"}`),
    status: m.status?.status ?? null,
    note: m.status?.note || undefined,
    bookedPercent: null,
    isSelf: m.isSelf,
  }));
  const selected = group.members.find((m) => m.person.id === selectedId) ?? group.members[0]!;
  return (
    <>
      <SocialPageHeader
        group={group}
        trail={[{ label: t("members.title") }]}
        title={t("members.title")}
        titleAddon={<span className="text-sm font-semibold text-fg-secondary">{t("people", { count: group.memberCount ?? 0, n: group.memberCount === null ? t("common.notShown") : format.number(group.memberCount) })}</span>}
        actions={group.capabilities.invite ? <Button className="gap-2" aria-haspopup="dialog" onClick={() => setInviting(true)}><Icon icon={UserPlus} size={16} />{t("common.invite")}</Button> : undefined}
      />
      <div data-scope="social">
        <PeopleWorkload
          title={t("members.whosAround")}
          people={people}
          scope="social"
          selectedId={selectedId}
          onSelect={setSelectedId}
          statusLabel={(status) => t(`status.${status === null || status === "off" ? "none" : status}`)}
          legend={["available", "busy", "away"]}
          statusOnly
          action={(person) =>
            person.isSelf ? (
              <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setSettingStatus(true)}>{t("members.setStatus")}</Button>
            ) : (
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => void message(person.id)}><Icon icon={MessageCircle} size={14} />{t("common.message")}</Button>
            )
          }
          footnote={t("members.statusOnly")}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <FolderTabsCard
          label={t("members.tabs.label")}
          defaultValue="members"
          tabs={[
            {
              value: "members",
              label: t("members.tabs.members"),
              count: format.number(group.members.length),
              content: (
                <div className="flex flex-col gap-2">
                  <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.members.map((m) => (
                      <li key={m.person.id}>
                        <button type="button" aria-pressed={m.person.id === selected.person.id} onClick={() => setSelectedId(m.person.id)} className={`flex w-full items-center gap-3 rounded-row px-3 py-2 text-start transition-colors ${m.person.id === selected.person.id ? "bg-scope-soft" : "bg-subtle hover:bg-raised"}`}>
                          <PersonAvatar person={m.person} status={m.status} />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <bdi className="truncate text-sm font-semibold text-fg">{m.isSelf ? t("members.you") : m.person.name}</bdi>
                            <span className="truncate text-xs text-fg-secondary">{t(`roles.${m.role ?? "unknown"}`)} · {t(`status.${m.status?.status ?? "none"}`)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-fg-muted">{t("members.guestsNote")} {t("members.privacy")}</p>
                </div>
              ),
            },
            ...(group.capabilities.decideJoins ? [{ value: "requests", label: t("members.tabs.requests"), count: format.number(group.pendingRequests), content: <JoinRequestsCard groupId={group.id} bare /> }] : []),
            { value: "invited", label: t("members.tabs.invited"), content: <Invites group={group} /> },
          ]}
        />
        <MemberCard group={group} member={selected} onMessage={() => void message(selected.person.id)} onSetStatus={() => setSettingStatus(true)} />
      </div>
      {settingStatus ? <StatusDialog group={group} current={group.members.find((m) => m.isSelf)?.status ?? null} onClose={() => setSettingStatus(false)} /> : null}
      {inviting ? <InviteDialog group={group} onClose={() => setInviting(false)} /> : null}
    </>
  );
}

function MemberCard({ group, member: m, onMessage, onSetStatus }: { group: GroupDetail; member: GroupMember; onMessage: () => void; onSetStatus: () => void }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const [removing, setRemoving] = useState(false);
  const role = useSocialMutation((repo, value: "admin" | "member") => repo.groups.setRole(group.id, m.person.id, value));
  const remove = useSocialMutation((repo) => repo.groups.removeMember(group.id, m.person.id));
  const body = (
    <>
      <p className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">{t("members.memberCard")} · {t(`roles.${m.role ?? "unknown"}`)}</p>
      <div className="flex items-center gap-3 pe-16">
        <PersonAvatar person={m.person} size={48} status={m.status} />
        <h2 id="member-name" className="type-h2 text-fg"><bdi>{m.isSelf ? t("members.you") : m.person.name}</bdi></h2>
      </div>
      <p className="text-sm text-fg-secondary">
        {m.status ? (m.status.note ? t("members.statusLine", { status: t(`status.${m.status.status}`), note: m.status.note }) : t(`status.${m.status.status}`)) : t("status.none")}
      </p>
      {m.joinedAt ? <p className="text-xs text-fg-muted">{t("members.joined", { date: format.day(m.joinedAt.slice(0, 10), "full") })}</p> : null}
      {!m.isSelf && m.role !== "owner" && (group.capabilities.changeRoles || group.capabilities.removeMembers) ? (
        <div className="flex flex-wrap gap-2 border-t border-line pt-3">
          {group.capabilities.changeRoles ? (
            <Button size="sm" variant="secondary" disabled={role.isPending} onClick={() => role.mutate(m.role === "admin" ? "member" : "admin", { onSuccess: () => toast({ title: t("members.roleChanged") }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
              {m.role === "admin" ? t("members.makeMember") : t("members.makeAdmin")}
            </Button>
          ) : null}
          {group.capabilities.removeMembers && (m.role === "member" || group.myRole === "owner") ? (
            <Button size="sm" variant="ghost" className="text-danger-text" aria-haspopup="dialog" onClick={() => setRemoving(true)}>{t("members.remove")}</Button>
          ) : null}
        </div>
      ) : null}
      <p className="text-xs text-fg-muted">{t("members.privacy")}</p>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        tone="destructive"
        title={t("members.removeTitle", { name: m.person.name })}
        description={t("members.removeBody")}
        confirmLabel={t("members.removeConfirm")}
        error={remove.isError ? errorText(remove.error) : undefined}
        onConfirm={() => remove.mutateAsync(undefined).then(() => toast({ title: t("members.removed", { name: m.person.name }) }))}
      />
    </>
  );
  return (
    <SignatureCard
      as="section"
      aria-labelledby="member-name"
      contentClassName="flex flex-col gap-3"
      action={m.isSelf ? <SignatureCardAction label={t("members.setStatus")} icon={CircleDot} aria-haspopup="dialog" onClick={onSetStatus} /> : <SignatureCardAction label={t("common.message")} icon={MessageCircle} onClick={onMessage} />}
    >
      {body}
    </SignatureCard>
  );
}

function Invites({ group }: { group: GroupDetail }) {
  const t = useTranslations("Social.members");
  const format = useSocialFormat();
  const invites = useGroupInvites(group.id);
  const act = useSocialMutation((repo, input: { id: string; action: "resend" | "cancel" }) => (input.action === "resend" ? repo.groups.resendInvite(group.id, input.id) : repo.groups.cancelInvite(group.id, input.id)));
  const list = invites.data ?? [];
  if (invites.isError) return <SocialUnsupported compact />;
  if (list.length === 0) return <p className="p-2 text-sm text-fg-secondary">{t("noInvites")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {list.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2">
          <span className="flex min-w-0 flex-1 flex-col">
            <bdi className="text-sm font-semibold text-fg">{i.label}</bdi>
            <span className="text-xs text-fg-secondary">{t("invitedBy", { name: i.invitedBy.name, date: format.relative(i.at) })}</span>
          </span>
          {group.capabilities.decideJoins ? (
            <span className="flex gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => act.mutate({ id: i.id, action: "resend" })}>{t("resend")}</Button>
              <Button size="sm" variant="ghost" onClick={() => act.mutate({ id: i.id, action: "cancel" })}>{t("cancelInvite")}</Button>
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

function StatusDialog({ group, current, onClose }: { group: GroupDetail; current: GroupStatus | null; onClose: () => void }) {
  const t = useTranslations("Social");
  const [status, setStatus] = useState<GroupStatus["status"]>(current?.status ?? "available");
  const [note, setNote] = useState(current?.note ?? "");
  const [clear, setClear] = useState<"never" | "today" | "week">("never");
  const save = useSocialMutation((repo, value: GroupStatus | null) => repo.groups.setMyStatus(group.id, value));
  const clearsAt = () => {
    if (clear === "never") return null;
    const now = new Date(getPlannerNow());
    if (clear === "today") {
      now.setHours(23, 59, 0, 0);
      return now.toISOString();
    }
    return new Date(now.getTime() + 7 * 86_400_000).toISOString();
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("members.statusTitle", { group: group.name })} description={t("members.statusOnly")}>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate({ status, note: note.trim(), clearsAt: clearsAt() }, { onSuccess: () => { toast({ title: t("members.statusSaved") }); onClose(); } }); }}>
          <RadioGroup value={status} onValueChange={(v) => setStatus(v as GroupStatus["status"])} aria-label={t("members.setStatus")}>
            {(["available", "busy", "away"] as const).map((s) => <RadioGroupItem key={s} value={s} label={t(`status.${s}`)} />)}
          </RadioGroup>
          <Field><FieldLabel>{t("members.note")}</FieldLabel><Input dir="auto" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-bold">{t("members.clearAfter")}</legend>
            <RadioGroup value={clear} onValueChange={(v) => setClear(v as typeof clear)}>
              {(["never", "today", "week"] as const).map((c) => <RadioGroupItem key={c} value={c} label={t(`members.clear.${c}`)} />)}
            </RadioGroup>
          </fieldset>
          <DialogFooter>
            {current ? <Button type="button" variant="ghost" onClick={() => save.mutate(null, { onSuccess: onClose })}>{t("members.clearStatus")}</Button> : null}
            <Button type="submit" disabled={save.isPending}>{t("members.saveStatus")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

