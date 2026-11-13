"use client";

import { Ban, Bell, BellOff, Flag, LogOut, Search, UserMinus, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SearchField } from "@/components/ui/search-field";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import type { ConversationDetail, PolicyKey } from "@/data/messaging-domain";
import { useChannelWorkspace, useConversationMedia, useLookup, useMessagingMutation, useParticipants, usePinnedMessages } from "@/data/messaging-queries";
import { plainText } from "@/data/mock/mock-messaging";
import { useMsgFormat } from "../format";
import { errorText, ReportDialog } from "../message-dialogs";
import { messagesHref } from "../paths";
import { ConversationAvatar, ConversationTitle, PersonAvatar, SourceChip } from "../visuals";

/*
 * Conversation info (MS-08): header, quick actions, FolderTabs Members ·
 * Media & files · Pinned, settings, danger zone. Group admins add/remove
 * people, rename and set newcomer history; channel admins change policy
 * within workspace limits ("Set by …" when inherited); no Leave for
 * mandatory channels; Block only in direct. If the user is removed while
 * this is open, the conversation shows the removed state and the panel goes.
 */
export function InfoPanel({ conversation: c, closeHref, backHref }: { conversation: ConversationDetail; closeHref: string; backHref: string }) {
  const t = useTranslations("Msg.info");
  const tMsg = useTranslations("Msg");
  const f = useMsgFormat();
  const router = useRouter();
  const participants = useParticipants(c.id);
  const media = useConversationMedia(c.id);
  const pinned = usePinnedMessages(c.id);
  const [confirm, setConfirm] = useState<"leave" | "block" | null>(null);
  const [reporting, setReporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [rename, setRename] = useState(c.title);
  const fail = (e: unknown) => toast({ title: errorText(tMsg as never, e), tone: "danger" });

  const mute = useMessagingMutation((repo, muted: boolean) => repo.conversations.mute(c.id, muted));
  const settings = useMessagingMutation((repo, patch: Parameters<typeof repo.conversations.updateSettings>[1]) => repo.conversations.updateSettings(c.id, patch));
  const policy = useMessagingMutation((repo, patch: Partial<Record<PolicyKey, boolean | "from-join" | "full">>) => repo.conversations.updatePolicy(c.id, patch as never));
  const renameMutation = useMessagingMutation((repo, name: string) => repo.conversations.rename(c.id, name));
  const remove = useMessagingMutation((repo, personId: string) => repo.conversations.removePerson(c.id, personId));
  const leave = useMessagingMutation((repo) => repo.conversations.leave(c.id));
  const block = useMessagingMutation((repo, personId: string) => (c.blockedBy === "me" ? repo.settings.unblock(personId) : repo.settings.block(personId)));
  const unpin = useMessagingMutation((repo, id: string) => repo.messages.pin(id, false));

  const canLeave = c.kind !== "direct" && !c.policy?.mandatory;
  const subtitle = c.kind === "direct" ? tMsg("conv.direct") : c.kind === "group" ? tMsg("conv.group", { count: c.memberCount }) : tMsg("conv.channel", { workspace: c.source.name, count: c.memberCount });
  const policyRow = (key: PolicyKey, label: string, on: boolean, toggle: (on: boolean) => Partial<Record<PolicyKey, boolean | "from-join" | "full">>) => (
    <Switch
      key={key}
      label={label}
      description={c.policy?.inherited.includes(key) && c.policy.setBy ? t("setBy", { workspace: c.policy.setBy }) : undefined}
      checked={on}
      disabled={!c.canManage}
      onCheckedChange={(next) => policy.mutate(toggle(next), { onError: fail })}
    />
  );

  return (
    <section aria-labelledby="info-title" className="flex flex-col gap-4 rounded-[28px] bg-surface p-4 shadow-island lg:sticky lg:top-4">
      <header className="flex items-start gap-3">
        <ConversationAvatar kind={c.kind} initials={c.initials} source={c.source} size={48} />
        <div className="min-w-0 flex-1">
          <h2 id="info-title" className="type-title">
            <ConversationTitle kind={c.kind} title={c.title || tMsg("bubble.deletedUser")} />
          </h2>
          <p className="text-xs text-fg-secondary">{subtitle}</p>
          {c.kind === "channel" ? <SourceChip source={c.source} className="mt-1" /> : null}
        </div>
        <Link href={closeHref} aria-label={t("close")} className="grid size-10 place-items-center rounded-pill bg-secondary hover:bg-secondary-hover">
          <Icon icon={X} size={18} />
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => mute.mutate(!c.muted)}>
          <Icon icon={c.muted ? Bell : BellOff} size={16} />
          {c.muted ? t("unmute") : t("mute")}
        </Button>
        <Button size="sm" variant="secondary" asChild>
          <Link href={`${messagesHref.search}?in=${encodeURIComponent(c.id)}`}>
            <Icon icon={Search} size={16} />
            {t("search")}
          </Link>
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setReporting(true)}>
          <Icon icon={Flag} size={16} />
          {t("report")}
        </Button>
      </div>

      <FolderTabsCard
        label={t("sections")}
        defaultValue="members"
        surface="subtle"
        tabs={[
          {
            value: "members",
            label: t("tabs.members"),
            count: participants.data?.length,
            content: (
              <ul className="flex flex-col gap-1">
                {(participants.data ?? []).map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl p-1.5">
                    <PersonAvatar person={p} />
                    <bdi className="min-w-0 flex-1 truncate text-sm font-semibold">{p.deleted ? tMsg("bubble.deletedUser") : p.name}</bdi>
                    <span className="text-xs text-fg-secondary">{p.you ? t("you") : t(`roles.${p.role}`)}</span>
                    {c.canManage && !p.you ? (
                      <button type="button" aria-label={t("removePerson", { name: p.name })} onClick={() => remove.mutate(p.id, { onError: fail })} className="grid size-8 place-items-center rounded-pill hover:bg-surface">
                        <Icon icon={UserMinus} size={16} />
                      </button>
                    ) : null}
                  </li>
                ))}
                {c.canManage ? (
                  <li>
                    <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
                      <Icon icon={UserPlus} size={16} />
                      {t("addPeople")}
                    </Button>
                  </li>
                ) : null}
              </ul>
            ),
          },
          {
            value: "media",
            label: t("tabs.media"),
            count: media.data?.length,
            content: media.data?.length ? (
              <ul className="flex flex-col gap-1">
                {media.data.map(({ message, attachment }) => (
                  <li key={attachment.id} className="flex items-center justify-between gap-2 rounded-2xl p-2 text-sm">
                    <bdi className="min-w-0 truncate font-semibold">{attachment.name}</bdi>
                    <span className="shrink-0 text-xs text-fg-secondary">
                      {t(`kinds.${attachment.kind}`)} · {f.bytes(attachment.bytes)} · {f.listTime(message.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-secondary">{t("noMedia")}</p>
            ),
          },
          {
            value: "pinned",
            label: t("tabs.pinned"),
            count: pinned.data?.length,
            content: pinned.data?.length ? (
              <ul className="flex flex-col gap-1">
                {pinned.data.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-2xl p-2 text-sm">
                    <span dir="auto" className="min-w-0 flex-1 truncate">
                      <bdi className="font-bold">{m.author.name || tMsg("bubble.deletedUser")}</bdi>: {plainText(m.body)}
                    </span>
                    {m.can.pin ? (
                      <Button size="sm" variant="ghost" onClick={() => unpin.mutate(m.id)}>
                        {tMsg("actions.unpin")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-secondary">{t("noPinned")}</p>
            ),
          },
        ]}
      />

      <section aria-labelledby="info-settings" className="flex flex-col gap-3 rounded-2xl bg-subtle p-3">
        <h3 id="info-settings" className="text-sm font-bold">
          {t("settings")}
        </h3>
        {c.canManage && c.kind !== "direct" ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              renameMutation.mutate(rename, { onSuccess: () => toast({ title: t("renamed") }), onError: fail });
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold">
              {t("name")}
              <Input value={rename} onChange={(e) => setRename(e.target.value)} maxLength={60} />
            </label>
            <Button type="submit" size="sm" variant="secondary" disabled={!rename.trim() || rename === c.title}>
              {t("save")}
            </Button>
          </form>
        ) : null}
        <Switch label={t("notifications")} description={t("notificationsHint")} checked={!c.muted} onCheckedChange={(on) => mute.mutate(!on)} />
        <Switch
          label={t("linkPreviews")}
          checked={c.linkPreviews}
          disabled={c.kind !== "direct" && !c.canManage}
          onCheckedChange={(on) => settings.mutate({ linkPreviews: on }, { onError: fail })}
        />
        {c.kind === "group" ? (
          <Switch
            label={t("newcomerHistory")}
            description={t("newcomerHint")}
            checked={c.newcomerHistory === "full"}
            disabled={!c.canManage}
            onCheckedChange={(on) => settings.mutate({ newcomerHistory: on ? "full" : "from-join" }, { onError: fail })}
          />
        ) : null}
        {c.kind !== "direct" ? <Switch label={t("collapseBlocked")} checked={c.collapseBlocked} onCheckedChange={(on) => settings.mutate({ collapseBlocked: on })} /> : null}
        {c.policy ? (
          <div className="flex flex-col gap-3 border-t border-hairline pt-3">
            <h4 className="text-xs font-bold text-fg-secondary">{t("policy")}</h4>
            {policyRow("authorDeleteForEveryone", t("policyDelete"), c.policy.authorDeleteForEveryone, (on) => ({ authorDeleteForEveryone: on }))}
            {policyRow("newcomerHistory", t("policyHistory"), c.policy.newcomerHistory === "full", (on) => ({ newcomerHistory: on ? "full" : "from-join" }))}
            {policyRow("membersCanPin", t("policyPin"), c.policy.membersCanPin, (on) => ({ membersCanPin: on }))}
            {c.canManage ? <p className="text-xs text-fg-secondary">{t("policyLimit", { workspace: c.policy.setBy ?? c.source.name })}</p> : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="info-danger" className="flex flex-col items-start gap-2 rounded-2xl border border-hairline p-3">
        <h3 id="info-danger" className="text-sm font-bold">
          {t("danger")}
        </h3>
        {c.kind === "direct" && c.other ? (
          <>
            <Button size="sm" variant="outline" onClick={() => setConfirm("block")}>
              <Icon icon={Ban} size={16} />
              {c.blockedBy === "me" ? t("unblock", { name: c.title }) : t("block", { name: c.title })}
            </Button>
            <p className="text-xs text-fg-secondary">{t("blockHint")}</p>
          </>
        ) : null}
        {canLeave ? (
          <Button size="sm" variant="outline" onClick={() => setConfirm("leave")}>
            <Icon icon={LogOut} size={16} />
            {t("leave")}
          </Button>
        ) : c.kind === "channel" ? (
          <p className="text-xs text-fg-secondary">{t("mandatory")}</p>
        ) : null}
      </section>

      {confirm === "leave" ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={t("leaveTitle")}
          description={t("leaveDescription")}
          confirmLabel={t("leave")}
          tone="destructive"
          onConfirm={async () => {
            await leave.mutateAsync(undefined as never);
            router.push(backHref);
          }}
        />
      ) : null}
      {confirm === "block" && c.other ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setConfirm(null)}
          title={c.blockedBy === "me" ? t("unblock", { name: c.title }) : t("block", { name: c.title })}
          description={t("blockHint")}
          confirmLabel={c.blockedBy === "me" ? t("unblockConfirm") : t("blockConfirm")}
          tone={c.blockedBy === "me" ? "default" : "destructive"}
          onConfirm={async () => {
            await block.mutateAsync(c.other!.id);
            setConfirm(null);
          }}
        />
      ) : null}
      {reporting ? <ReportDialog target={{ conversationId: c.id }} onClose={() => setReporting(false)} /> : null}
      {adding ? <AddPeopleDialog conversation={c} existing={(participants.data ?? []).map((p) => p.id)} onClose={() => setAdding(false)} /> : null}
    </section>
  );
}

function AddPeopleDialog({ conversation: c, existing, onClose }: { conversation: ConversationDetail; existing: string[]; onClose: () => void }) {
  const t = useTranslations("Msg.info");
  const tMsg = useTranslations("Msg");
  const workspace = useChannelWorkspace(c.kind === "channel" ? (c.source.workspaceId ?? undefined) : undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const lookup = useLookup(c.kind === "channel" ? "" : query);
  const add = useMessagingMutation((repo, ids: string[]) => repo.conversations.addPeople(c.id, ids));
  const candidates = (c.kind === "channel" ? (workspace.data?.members ?? []) : (lookup.data?.people ?? [])).filter((p) => !existing.includes(p.id));
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("addPeople")} description={c.kind === "channel" ? t("addHintChannel") : t("addHintGroup")}>
        {c.kind !== "channel" ? <SearchField value={query} onValueChange={setQuery} aria-label={t("searchPeople")} placeholder={t("searchPeople")} /> : null}
        {c.kind === "channel" || query.trim() ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
            {candidates.map((p) => (
              <li key={p.id}>
                <label className="flex items-center gap-2 rounded-xl p-2 text-sm">
                  <Checkbox checked={picked.includes(p.id)} onCheckedChange={(on) => setPicked((list) => (on === true ? [...list, p.id] : list.filter((id) => id !== p.id)))} />
                  <bdi>{p.name}</bdi>
                </label>
              </li>
            ))}
            {candidates.length === 0 ? <li className="text-sm text-fg-secondary">{t("noCandidates")}</li> : null}
          </ul>
        ) : null}
        <DialogFooter>
          <Button
            disabled={!picked.length}
            loading={add.isPending}
            onClick={() =>
              add.mutate(picked, {
                onSuccess: onClose,
                onError: (e) => toast({ title: errorText(tMsg as never, e), tone: "danger" }),
              })
            }
          >
            {t("add")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
