"use client";

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { RemovableChip } from "@/components/ui/chip";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { SearchField } from "@/components/ui/search-field";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import type { MsgPerson, MsgSource } from "@/data/messaging-domain";
import { useMessagingRepository } from "@/data/messaging-provider";
import { newClientOpId, useChannelWorkspace, useLookup, useMessagingMutation } from "@/data/messaging-queries";
import { MessagingError } from "@/data/messaging-repositories";
import { errorText } from "../message-dialogs";
import { channelsHref, messagesHref } from "../paths";
import { PersonAvatar, SourceChip } from "../visuals";

/*
 * MS-90 sheets. conversation-new: lookup only returns people the user may
 * message (mutual connections + people sharing a workspace) and never says
 * whether an account exists; 2+ people → private group (creator = admin).
 * channel-new: workspace admins only; policy toggles start from the
 * workspace and can only be stricter (looser options are locked, "Set by …").
 */

export function ConversationNewSheet({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Msg.sheets.conversation");
  const tMsg = useTranslations("Msg");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<MsgPerson[]>([]);
  const [name, setName] = useState("");
  const [opId] = useState(newClientOpId);
  const lookup = useLookup(query);
  const create = useMessagingMutation((repo, vars: { ids: string[]; name: string }) => repo.conversations.create({ personIds: vars.ids, name: vars.name || undefined, clientOpId: opId }));
  const toggle = (person: MsgPerson) => setSelected((list) => (list.some((p) => p.id === person.id) ? list.filter((p) => p.id !== person.id) : [...list, person]));
  const rateLimited = lookup.error instanceof MessagingError && lookup.error.code === "unavailable";

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!selected.length) return;
        try {
          const id = await create.mutateAsync({ ids: selected.map((p) => p.id), name: name.trim() });
          onDone();
          router.push(messagesHref.conversation(id));
        } catch (e) {
          toast({ title: errorText(tMsg as never, e), tone: "danger" });
        }
      }}
    >
      <p className="text-sm text-fg-secondary">{t("hint")}</p>
      <SearchField value={query} onValueChange={setQuery} placeholder={t("search")} aria-label={t("search")} />
      {selected.length ? (
        <div className="flex flex-wrap gap-1.5" aria-label={t("selected")}>
          {selected.map((p) => (
            <RemovableChip key={p.id} label={p.name} onRemove={() => toggle(p)} />
          ))}
        </div>
      ) : null}
      {query.trim() ? (
        rateLimited ? (
          <p role="alert" className="text-sm text-danger-text">
            {tMsg("errors.rateLimited")}
          </p>
        ) : lookup.data && lookup.data.people.length === 0 ? (
          <p className="rounded-2xl bg-subtle p-3 text-sm text-fg-secondary">{t("noResults")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {(lookup.data?.people ?? []).map((p) => {
              const on = selected.some((s) => s.id === p.id);
              return (
                <li key={p.id}>
                  <button type="button" aria-pressed={on} onClick={() => toggle(p)} className="flex w-full items-center gap-3 rounded-2xl p-2 text-start hover:bg-subtle">
                    <PersonAvatar person={p} />
                    <bdi className="flex-1 text-sm font-bold">{p.name}</bdi>
                    {on ? <Icon icon={Check} size={18} className="text-scope-deep" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
      {selected.length > 1 ? (
        <Field>
          <FieldLabel>{t("groupName")}</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          <FieldDescription>{t("groupHint")}</FieldDescription>
        </Field>
      ) : null}
      <Button type="submit" disabled={!selected.length} loading={create.isPending}>
        {t("start")}
      </Button>
    </form>
  );
}

export function ChannelNewSheet({ source, onDone }: { source: MsgSource; onDone: () => void }) {
  const t = useTranslations("Msg.sheets.channel");
  const tMsg = useTranslations("Msg");
  const router = useRouter();
  const meId = useMessagingRepository().me.id;
  const workspace = useChannelWorkspace(source.workspaceId ?? undefined);
  const [name, setName] = useState("");
  const [everyone, setEveryone] = useState(true);
  const [members, setMembers] = useState<string[]>([]);
  const [policy, setPolicy] = useState<{ authorDeleteForEveryone: boolean; fullHistory: boolean; membersCanPin: boolean } | null>(null);
  const [opId] = useState(newClientOpId);
  const create = useMessagingMutation((repo, vars: Parameters<typeof repo.channels.create>[0]) => repo.channels.create(vars));

  if (workspace.isPending) return null;
  const ws = workspace.data;
  if (!ws || !ws.canCreate) return <p className="rounded-2xl bg-subtle p-4 text-sm text-fg-secondary">{t("notAllowed")}</p>;
  const defaults = ws.defaults;
  const value = policy ?? { authorDeleteForEveryone: defaults.authorDeleteForEveryone, fullHistory: defaults.newcomerHistory === "full", membersCanPin: defaults.membersCanPin };
  const set = (patch: Partial<typeof value>) => setPolicy({ ...value, ...patch });
  const locked = (allowedByWorkspace: boolean) => (allowedByWorkspace ? undefined : t("locked", { workspace: ws.source.name }));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        try {
          const id = await create.mutateAsync({
            workspace: ws.source,
            name,
            memberIds: everyone ? "all" : members,
            policy: { authorDeleteForEveryone: value.authorDeleteForEveryone, newcomerHistory: value.fullHistory ? "full" : "from-join", membersCanPin: value.membersCanPin },
            clientOpId: opId,
          });
          onDone();
          router.push(channelsHref(ws.source, id));
        } catch (e) {
          toast({ title: errorText(tMsg as never, e), tone: "danger" });
        }
      }}
    >
      <div className="flex items-center gap-2 text-sm text-fg-secondary">
        {t("workspace")} <SourceChip source={ws.source} />
      </div>
      <Field>
        <FieldLabel>{t("name")}</FieldLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} startAdornment={<span aria-hidden>#</span>} maxLength={40} required />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-bold">{t("members")}</legend>
        <Switch label={t("allMembers")} checked={everyone} onCheckedChange={setEveryone} />
        {!everyone ? (
          <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-2xl bg-subtle p-2">
            {ws.members
              .filter((p) => p.id !== meId)
              .map((p) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2 rounded-xl p-1.5 text-sm">
                    <Checkbox checked={members.includes(p.id)} onCheckedChange={(on) => setMembers((list) => (on === true ? [...list, p.id] : list.filter((id) => id !== p.id)))} />
                    <bdi>{p.name}</bdi>
                  </label>
                </li>
              ))}
          </ul>
        ) : null}
      </fieldset>
      <fieldset className="flex flex-col gap-3 rounded-2xl bg-subtle p-3">
        <legend className="sr-only">{t("policy")}</legend>
        <Switch label={t("deletePolicy")} description={locked(defaults.authorDeleteForEveryone)} checked={value.authorDeleteForEveryone} disabled={!defaults.authorDeleteForEveryone} onCheckedChange={(on) => set({ authorDeleteForEveryone: on })} />
        <Switch label={t("history")} description={locked(defaults.newcomerHistory === "full")} checked={value.fullHistory} disabled={defaults.newcomerHistory !== "full"} onCheckedChange={(on) => set({ fullHistory: on })} />
        <Switch label={t("pin")} description={locked(defaults.membersCanPin)} checked={value.membersCanPin} disabled={!defaults.membersCanPin} onCheckedChange={(on) => set({ membersCanPin: on })} />
        <p className="text-xs text-fg-secondary">{t("stricterNote", { workspace: ws.source.name })}</p>
      </fieldset>
      <Button type="submit" disabled={!name.trim()} loading={create.isPending}>
        {t("create")}
      </Button>
    </form>
  );
}
