"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { MsgSource } from "@/data/messaging-domain";
import { getPlannerToday } from "@/data/clock";
import { newClientOpId, useInvitable, useMeetingSources, useMessagingMutation } from "@/data/messaging-queries";
import { instantAtTime } from "@/lib/dates/clock-time";
import { errorText } from "../message-dialogs";
import { messagesHref } from "../paths";
import { sourceParam } from "../sheets/messaging-sheet-params";
import { useMsgFormat } from "../format";

/*
 * MT-02 Create (?sheet=meeting-new, opened from any calendar): title, where
 * it belongs (Personal · project · team · company — sets visibility, colour
 * and which calendar shows it), when, invitees (only people that source may
 * invite) and an optional external link (https only; no built-in calls).
 */
export function MeetingNewSheet({ initialSource, day, onDone }: { initialSource: MsgSource | null; day: string | null; onDone: () => void }) {
  const t = useTranslations("Msg.sheets.meeting");
  const tMsg = useTranslations("Msg");
  const f = useMsgFormat();
  const router = useRouter();
  const sources = useMeetingSources();
  const [sourceKey, setSourceKey] = useState(initialSource ? sourceParam(initialSource.kind, initialSource.workspaceId) : "personal");
  // Only sources the server lets me organise in are listed (live has no Personal until OD-1): fall back to the first one.
  const source = sources.data?.find((s) => sourceParam(s.kind, s.workspaceId) === sourceKey) ?? (initialSource ? undefined : sources.data?.[0]);
  const selectedKey = source ? sourceParam(source.kind, source.workspaceId) : sourceKey;
  const invitable = useInvitable(source);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : getPlannerToday());
  const [start, setStart] = useState("09:30");
  const [end, setEnd] = useState("10:30");
  const [invitees, setInvitees] = useState<string[]>([]);
  const [link, setLink] = useState("");
  const [opId] = useState(newClientOpId);
  const create = useMessagingMutation((repo, input: Parameters<typeof repo.meetings.create>[0]) => repo.meetings.create(input));
  const invalidLink = link.trim() !== "" && !/^https:\/\/\S+$/.test(link.trim());
  const invalidTime = end <= start;
  const label = (s: MsgSource) => (s.kind === "personal" ? tMsg("meetings.personal") : s.name);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!source || invalidLink || invalidTime || !title.trim()) return;
        try {
          const id = await create.mutateAsync({
            title,
            source,
            start: instantAtTime(date, start),
            end: instantAtTime(date, end),
            inviteeIds: invitees,
            link: link.trim() || null,
            clientOpId: opId,
          });
          onDone();
          router.push(messagesHref.meeting(id));
        } catch (e) {
          toast({ title: errorText(tMsg as never, e), tone: "danger" });
        }
      }}
    >
      <Field>
        <FieldLabel>{t("title_")}</FieldLabel>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
      </Field>
      <Field>
        <FieldLabel>{t("belongs")}</FieldLabel>
        <Select
          value={selectedKey}
          onValueChange={(value) => {
            setSourceKey(value);
            setInvitees([]);
          }}
        >
          {(sources.data ?? []).map((s) => (
            <SelectItem key={sourceParam(s.kind, s.workspaceId)} value={sourceParam(s.kind, s.workspaceId)}>
              {label(s)}
            </SelectItem>
          ))}
        </Select>
        <FieldDescription>{t("belongsHint")}</FieldDescription>
      </Field>
      <fieldset className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
        <legend className="mb-1 text-sm font-bold">{t("when")}</legend>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {t("date")} <span className="font-normal text-fg-secondary">{f.date(`${date}T12:00:00+03:30`, "full")}</span>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} dir="ltr" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {t("start")}
          <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} dir="ltr" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold">
          {t("end")}
          <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} dir="ltr" invalid={invalidTime} />
        </label>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-bold">{t("invite")}</legend>
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-2xl bg-subtle p-2">
          {(invitable.data ?? []).map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 rounded-xl p-1.5 text-sm">
                <Checkbox checked={invitees.includes(p.id)} onCheckedChange={(on) => setInvitees((list) => (on === true ? [...list, p.id] : list.filter((id) => id !== p.id)))} />
                <bdi>{p.name}</bdi>
              </label>
            </li>
          ))}
          {invitable.data?.length === 0 ? <li className="p-1.5 text-sm text-fg-secondary">{t("noInvitees")}</li> : null}
        </ul>
      </fieldset>
      <Field invalid={invalidLink}>
        <FieldLabel>{t("link")}</FieldLabel>
        <Input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" placeholder="https://meet.example.com/…" />
        <FieldDescription>{t("linkHint")}</FieldDescription>
      </Field>
      <Button type="submit" disabled={!title.trim() || invalidLink || invalidTime || !source} loading={create.isPending}>
        {t("create")}
      </Button>
    </form>
  );
}
