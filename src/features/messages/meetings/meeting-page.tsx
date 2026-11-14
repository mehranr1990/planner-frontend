"use client";

import { Check, Copy, Download, FileText, Link2, Pencil, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRef, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { MeetingDetail, Rsvp } from "@/data/messaging-domain";
import { useMessagingRepository } from "@/data/messaging-provider";
import { useMessagePage, useMeeting, useMessagingMutation } from "@/data/messaging-queries";
import { saveBlob } from "@/data/personal-services-queries";
import { plainText } from "@/data/mock/mock-messaging";
import { cn } from "@/lib/cn";
import { useMsgFormat } from "../format";
import { errorText } from "../message-dialogs";
import { channelsHref, messagesHref, sourceScope } from "../paths";
import { PersonAvatar } from "../visuals";
import { MeetingSourceChip, MinutesChip, useMeetingTime } from "./meeting-parts";

/*
 * MT-02 · /messages/meetings/[id]: signature head (notch = Open meeting link;
 * without a link: Edit meeting for the organiser, Copy link for others),
 * RSVP, FolderTabs Agenda · Notes · Files, link to the source channel. No
 * call features — the meeting link is a plain external URL. People who are
 * not invited get "not found" (the calendar may show Busy only).
 */
export function MeetingPage({ id }: { id: string }) {
  const t = useTranslations("Msg.meeting");
  const meeting = useMeeting(id);
  if (meeting.isPending) return <AccessLoading />;
  if (meeting.isError) return <AccessState kind="error" />;
  if (!meeting.data) return <AccessState kind="msg-not-found" primaryAction={<Button asChild><Link href={messagesHref.meetings}>{t("backToMeetings")}</Link></Button>} />;
  return <MeetingBody meeting={meeting.data} />;
}

function MeetingBody({ meeting: m }: { meeting: MeetingDetail }) {
  const t = useTranslations("Msg.meeting");
  const tMsg = useTranslations("Msg");
  const tRsvp = useTranslations("Msg.meetings.rsvp");
  const { range, f } = useMeetingTime();
  const [editing, setEditing] = useState(false);
  const fail = (e: unknown) => toast({ title: errorText(tMsg as never, e), tone: "danger" });
  const rsvp = useMessagingMutation((repo, value: Exclude<Rsvp, "none">) => repo.meetings.rsvp(m.id, value));
  const going = m.invitees.filter((i) => i.rsvp === "going").length;
  const maybe = m.invitees.filter((i) => i.rsvp === "maybe").length;
  const organizer = m.invitees.find((i) => i.role === "organizer");
  const taker = m.invitees.find((i) => i.role === "minute-taker");
  const pageUrl = () => (typeof window === "undefined" ? "" : window.location.href);

  const action = m.link ? (
    <SignatureCardAction icon={Link2} label={t("openLink")} onClick={() => window.open(m.link!, "_blank", "noopener,noreferrer")} />
  ) : m.canEdit ? (
    <SignatureCardAction icon={Pencil} label={t("edit")} onClick={() => setEditing(true)} />
  ) : (
    <SignatureCardAction
      icon={Copy}
      variant="neutral"
      label={t("copyLink")}
      onClick={() => {
        void navigator.clipboard?.writeText(pageUrl());
        toast({ title: t("copied") });
      }}
    />
  );

  return (
    <div data-scope={sourceScope(m.source)} className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <SignatureCard as="section" aria-labelledby="meeting-title" action={action} contentClassName="gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <MeetingSourceChip source={m.source} />
            <span className="rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-bold text-fg-secondary">{t(`kind.${m.source.kind}`)}</span>
            {m.minutesStatus ? <MinutesChip status={m.minutesStatus} /> : null}
          </div>
          <h1 id="meeting-title" className="type-display text-fg">
            <bdi>{m.title}</bdi>
          </h1>
          <p className="text-sm text-fg-secondary">
            {f.date(m.start, "full")} · <span dir="ltr">{range(m)}</span>
            {organizer ? <> · {t("organiser", { name: organizer.name })}</> : null}
            {taker ? <> · {t("minuteTaker", { name: taker.name })}</> : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label={t("rsvpLabel")} className="flex gap-1.5">
              {(["going", "maybe", "not-going"] as const).map((value) => (
                <Button key={value} size="sm" variant={m.myRsvp === value ? "primary" : "outline"} aria-pressed={m.myRsvp === value} onClick={() => rsvp.mutate(value, { onError: fail })}>
                  {tRsvp(value)}
                </Button>
              ))}
            </div>
            <span className="flex-1" />
            <span className="flex *:not-first:-ms-2" aria-hidden>
              {m.invitees.slice(0, 4).map((i) => (
                <PersonAvatar key={i.id} person={i} className="ring-2 ring-surface" />
              ))}
            </span>
            <span className="text-xs text-fg-secondary">{t("counts", { going: f.number(going), maybe: f.number(maybe) })}</span>
          </div>
          {m.link ? (
            <a href={m.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-2xl bg-subtle px-4 py-2.5 text-sm">
              <Icon icon={Link2} size={16} />
              <span dir="ltr" className="min-w-0 flex-1 truncate">
                {m.link.replace(/^https:\/\//, "")}
              </span>
              <span className="text-xs text-fg-secondary">{t("external")}</span>
            </a>
          ) : m.location ? (
            <p className="text-sm">
              <bdi>{m.location}</bdi>
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" asChild>
              <Link href={messagesHref.minutes(m.id)}>
                <Icon icon={FileText} size={16} />
                {t("minutes")}
              </Link>
            </Button>
            {m.canEdit && m.link ? (
              <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                <Icon icon={Pencil} size={16} />
                {t("edit")}
              </Button>
            ) : null}
          </div>
        </SignatureCard>

        <FolderTabsCard
          label={t("sections")}
          defaultValue="agenda"
          tabs={[
            { value: "agenda", label: t("agenda"), count: m.agenda.length, content: <AgendaTab meeting={m} /> },
            // OD-16: live meetings have no shared notes (null) → no Notes tab.
            ...(m.notes !== null ? [{ value: "notes", label: t("notes"), content: <NotesTab meeting={m} /> }] : []),
            { value: "files", label: t("files"), count: m.files.length, content: <FilesTab meeting={m} /> },
          ]}
        />
      </div>
      <SourceConversation meeting={m} />
      {editing ? <EditMeetingDialog meeting={m} onClose={() => setEditing(false)} /> : null}
    </div>
  );
}

function AgendaTab({ meeting: m }: { meeting: MeetingDetail }) {
  const t = useTranslations("Msg.meeting");
  const f = useMsgFormat();
  const [title, setTitle] = useState("");
  const [minutes, setMinutes] = useState("10");
  const toggle = useMessagingMutation((repo, itemId: string) => repo.meetings.toggleAgenda(m.id, itemId));
  const add = useMessagingMutation((repo, vars: { title: string; minutes: number }) => repo.meetings.addAgenda(m.id, vars.title, vars.minutes));
  // OD-16 (live): text proposals, accepted or rejected by the organiser.
  const propose = useMessagingMutation((repo, text: string) => repo.meetings.proposeAgenda(m.id, text));
  const decide = useMessagingMutation((repo, vars: { itemId: string; accept: boolean }) => repo.meetings.decideAgenda(m.id, vars.itemId, vars.accept));
  const tMsg = useTranslations("Msg");
  const fail = (e: unknown) => toast({ title: errorText(tMsg as never, e), tone: "danger" });
  return (
    <div className="flex flex-col gap-2">
      {m.agenda.length === 0 ? <p className="text-sm text-fg-secondary">{t("agendaEmpty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {m.agenda.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-subtle p-3">
            {a.done !== null ? (
              <button
                type="button"
                role="checkbox"
                aria-checked={a.done}
                aria-label={a.title}
                disabled={!m.canEditAgenda}
                onClick={() => toggle.mutate(a.id)}
                className={cn("grid size-6 shrink-0 place-items-center rounded-pill border-[1.5px] border-outline", a.done && "border-scope-deep bg-scope-deep text-on-accent")}
              >
                {a.done ? <Icon icon={Check} size={14} /> : null}
              </button>
            ) : null}
            <span className="flex min-w-0 flex-1 flex-col">
              <bdi className={cn("text-sm font-bold", a.done && "text-fg-secondary line-through")}>{a.title}</bdi>
              {a.owner ? <bdi className="text-xs text-fg-secondary">{a.owner.name}</bdi> : null}
            </span>
            {a.proposed ? <span className="shrink-0 rounded-pill bg-info-soft px-2.5 py-0.5 text-xs font-bold text-info-text">{t("proposed")}</span> : null}
            {a.proposed && m.canDecideAgenda ? (
              <span className="flex shrink-0 gap-2">
                <Button size="sm" variant="secondary" loading={decide.isPending} onClick={() => decide.mutate({ itemId: a.id, accept: true }, { onError: fail })}>
                  {t("acceptProposal")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => decide.mutate({ itemId: a.id, accept: false }, { onError: fail })}>
                  {t("rejectProposal")}
                </Button>
              </span>
            ) : null}
            {a.minutes !== null ? <span className="shrink-0 text-xs font-bold">{t("minutesShort", { count: f.number(a.minutes) })}</span> : null}
          </li>
        ))}
      </ul>
      {!m.canEditAgenda && m.canProposeAgenda ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            propose.mutate(title, { onSuccess: () => setTitle(""), onError: fail });
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
            {t("agendaItem")}
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
          </label>
          <Button type="submit" size="sm" variant="secondary" disabled={!title.trim()} loading={propose.isPending}>
            <Icon icon={Plus} size={16} />
            {t("proposeAgenda")}
          </Button>
        </form>
      ) : null}
      {m.canEditAgenda ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim()) return;
            add.mutate({ title, minutes: Number(minutes) || 5 }, { onSuccess: () => setTitle("") });
          }}
        >
          <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-semibold">
            {t("agendaItem")}
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </label>
          <label className="flex w-24 flex-col gap-1 text-xs font-semibold">
            {t("duration")}
            <Input type="number" min={1} max={240} value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </label>
          <Button type="submit" size="sm" variant="secondary" disabled={!title.trim()}>
            <Icon icon={Plus} size={16} />
            {t("addAgenda")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function NotesTab({ meeting: m }: { meeting: MeetingDetail }) {
  const t = useTranslations("Msg.meeting");
  const [notes, setNotes] = useState(m.notes ?? "");
  const save = useMessagingMutation((repo, value: string) => repo.meetings.saveNotes(m.id, value));
  const meId = useMessagingRepository().me.id;
  const attendee = m.invitees.some((i) => i.id === meId);
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => m.notes !== null && notes !== m.notes && save.mutate(notes, { onSuccess: () => toast({ title: t("notesSaved") }) })}
        rows={8}
        dir="auto"
        aria-label={t("notes")}
        disabled={!attendee || m.notes === null}
      />
      <p className="text-xs text-fg-secondary">{t("notesHint")}</p>
    </div>
  );
}

function FilesTab({ meeting: m }: { meeting: MeetingDetail }) {
  const t = useTranslations("Msg.meeting");
  const tMsg = useTranslations("Msg");
  const f = useMsgFormat();
  const input = useRef<HTMLInputElement>(null);
  const attach = useMessagingMutation((repo, file: { name: string; bytes: number; blob: Blob }) => repo.meetings.attach(m.id, { ...file, linked: false }));
  const repo = useMessagingRepository();
  const [downloading, setDownloading] = useState<string | null>(null);
  // Bytes come through the server's authorised download (no storage URL); a 403 / 404 explains itself in the toast.
  const download = async (fileId: string) => {
    setDownloading(fileId);
    try {
      const { blob, name } = await repo.meetings.download(m.id, fileId);
      saveBlob(blob, name);
    } catch (err) {
      toast({ title: errorText(tMsg as never, err), tone: "danger" });
    } finally {
      setDownloading(null);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {m.files.length === 0 ? <p className="text-sm text-fg-secondary">{t("filesEmpty")}</p> : null}
      <ul className="flex flex-col gap-1">
        {m.files.map((file) => (
          <li key={file.id} className="flex items-center gap-2 rounded-2xl bg-subtle p-3 text-sm">
            <Icon icon={FileText} size={16} />
            <bdi className="min-w-0 flex-1 truncate font-semibold">{file.name}</bdi>
            <span className="text-xs text-fg-secondary">
              {file.linked ? t("linked") : t("uploaded")} · {f.bytes(file.bytes)}
            </span>
            {file.linked ? null : (
              <IconButton
                icon={Download}
                size="sm"
                variant="ghost"
                label={downloading === file.id ? t("downloading") : t("download", { name: file.name })}
                disabled={downloading !== null}
                aria-busy={downloading === file.id}
                onClick={() => void download(file.id)}
              />
            )}
          </li>
        ))}
      </ul>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) attach.mutate({ name: file.name, bytes: file.size, blob: file }, { onError: (err) => toast({ title: errorText(tMsg as never, err), tone: "danger" }) });
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="secondary" className="self-start" onClick={() => input.current?.click()}>
        <Icon icon={Plus} size={16} />
        {t("attach")}
      </Button>
    </div>
  );
}

function SourceConversation({ meeting: m }: { meeting: MeetingDetail }) {
  const t = useTranslations("Msg.meeting");
  const f = useMsgFormat();
  const page = useMessagePage(m.channelId ?? undefined);
  if (!m.channelId) return null;
  const last = (page.data?.items ?? []).filter((x) => x.state === "visible").slice(-2);
  return (
    <aside aria-labelledby="meeting-conv" className="flex flex-col gap-3 rounded-[28px] bg-surface p-4 shadow-island">
      <div className="flex items-center gap-2">
        <h2 id="meeting-conv" className="flex-1 type-title">
          {t("conversation")}
        </h2>
        <Link href={channelsHref(m.source, m.channelId)} className="text-xs font-bold text-scope-deep hover:underline">
          {t("openChannel")}
        </Link>
      </div>
      <ul className="flex flex-col gap-2">
        {last.map((x) => (
          <li key={x.id} className={cn("flex flex-col rounded-2xl px-3 py-2 text-sm", x.mine ? "self-end bg-scope-deep text-on-accent" : "bg-subtle")}>
            {!x.mine ? <bdi className="text-xs font-bold">{x.author.name}</bdi> : null}
            <span dir="auto">{plainText(x.body)}</span>
            <span className="self-end text-[11px] opacity-80">{f.time(x.createdAt)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-secondary">{t("conversationNote")}</p>
    </aside>
  );
}

function EditMeetingDialog({ meeting: m, onClose }: { meeting: MeetingDetail; onClose: () => void }) {
  const t = useTranslations("Msg.meeting");
  const tMsg = useTranslations("Msg");
  const [title, setTitle] = useState(m.title);
  const [link, setLink] = useState(m.link ?? "");
  const [description, setDescription] = useState(m.description);
  const update = useMessagingMutation((repo, patch: Parameters<typeof repo.meetings.update>[1]) => repo.meetings.update(m.id, patch));
  const invalidLink = link.trim() !== "" && !/^https:\/\/\S+$/.test(link.trim());
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={t("edit")}>
        <Field>
          <FieldLabel>{t("fieldTitle")}</FieldLabel>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </Field>
        <Field invalid={invalidLink}>
          <FieldLabel>{t("fieldLink")}</FieldLabel>
          <Input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" placeholder="https://" />
        </Field>
        <Field>
          <FieldLabel>{t("fieldDescription")}</FieldLabel>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} dir="auto" />
        </Field>
        <DialogFooter>
          <Button
            disabled={!title.trim() || invalidLink}
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { title, link: link.trim() || null, description },
                { onSuccess: onClose, onError: (e) => toast({ title: errorText(tMsg as never, e), tone: "danger" }) },
              )
            }
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
