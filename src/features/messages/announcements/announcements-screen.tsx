"use client";

import { BellRing, Check, Megaphone, Pin, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Progress } from "@/design-system/feedback/progress";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { getPlannerToday } from "@/data/clock";
import type { Announcement, MsgSource } from "@/data/messaging-domain";
import { useMessagingAvailable } from "@/data/messaging-provider";
import { newClientOpId, useAnnouncementAccess, useAnnouncements, useMessagingMutation } from "@/data/messaging-queries";
import { instantAtTime } from "@/lib/dates/clock-time";
import { WorkspaceHeader, useWorkspaceSource, type WorkspaceKind } from "../channels/channels-screen";
import { useMsgFormat } from "../format";
import { PersonAvatar } from "../visuals";
import { cn } from "@/lib/cn";
import { errorText } from "../message-dialogs";
import { sourceScope } from "../paths";

/*
 * MT-04 · /{workspace}/announcements: workspace-scoped posts for an audience
 * (whole workspace or a subset — only the audience sees them), optional pin
 * for n days and acknowledgement ("I've read it"); authors / publishers see
 * counts and names and may remind at most once a day. Not chat: no replies.
 * Composer = signature card, notch = Publish (or Schedule).
 */
export function AnnouncementsScreen({ kind }: { kind: WorkspaceKind }) {
  const t = useTranslations("Msg.announcements");
  const source = useWorkspaceSource(kind);
  if (!source) return null;
  return (
    <>
      <WorkspaceHeader kind={kind} title={t("title")} resource={t("title")} />
      <AnnouncementsBody source={source} />
    </>
  );
}

/** Feed + composer for one workspace (the screen adds the workspace header). */
export function AnnouncementsBody({ source }: { source: MsgSource }) {
  const t = useTranslations("Msg.announcements");
  const available = useMessagingAvailable();
  const list = useAnnouncements(source.workspaceId ?? undefined, source.kind);
  const access = useAnnouncementAccess(source.workspaceId ?? undefined);
  return (
    <>
      {!available ? (
        <AccessState kind="msg-not-available" />
      ) : (
        <div data-scope={sourceScope(source)} className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
          <section aria-label={t("feed")} className="flex min-w-0 flex-col gap-3">
            {list.isPending ? (
              <AccessLoading />
            ) : list.isError ? (
              <AccessState kind="error" titleAs="h2" />
            ) : list.data.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-[22px] bg-surface p-8 text-center shadow-island">
                <Icon icon={Megaphone} size={22} className="text-fg-muted" />
                <p className="text-sm text-fg-secondary">{t("empty", { workspace: source.name })}</p>
              </div>
            ) : (
              list.data.map((a) => <AnnouncementCard key={a.id} announcement={a} />)
            )}
          </section>
          {access.data?.canPublish ? <Composer source={source} audiences={access.data.audiences} /> : null}
        </div>
      )}
    </>
  );
}

function AnnouncementCard({ announcement: a }: { announcement: Announcement }) {
  const t = useTranslations("Msg.announcements");
  const tMsg = useTranslations("Msg");
  const f = useMsgFormat();
  const ack = useMessagingMutation((repo, id: string) => repo.announcements.ack(id));
  const remind = useMessagingMutation((repo, id: string) => repo.announcements.remind(id));
  const fail = (e: unknown) => toast({ title: errorText(tMsg as never, e), tone: "danger" });
  return (
    <article
      aria-labelledby={`an-${a.id}`}
      className={cn("flex flex-col gap-3 rounded-[24px] bg-surface p-5 shadow-island", a.requireAck && !a.acked && a.publishedAt && "inset-ring-[1.5px] inset-ring-scope-deep")}
    >
      <div className="flex items-start gap-3">
        {a.author ? <PersonAvatar person={a.author} /> : null}
        <div className="min-w-0 flex-1">
          <h2 id={`an-${a.id}`} className="text-base font-bold">
            <bdi>{a.title}</bdi>
          </h2>
          {/* Author / audience are shown only when served (live may serve neither) — never invented. */}
          <p className="text-xs text-fg-secondary">
            {[
              a.author ? <bdi key="author">{a.author.name || tMsg("bubble.deletedUser")}</bdi> : null,
              a.publishedAt ? <span key="at">{f.listTime(a.publishedAt)}</span> : null,
              a.audience ? (
                <span key="audience">
                  {a.audience.kind === "workspace" ? t("audienceAll", { count: f.number(a.audience.size) }) : t("audienceSubset", { label: a.audience.label, count: f.number(a.audience.size) })}
                </span>
              ) : null,
            ]
              .filter(Boolean)
              .flatMap((part, i) => (i ? [" · ", part] : [part]))}
          </p>
        </div>
        {a.pinned ? (
          <span title={a.pinnedUntil ? t("pinnedUntil", { date: f.date(a.pinnedUntil) }) : undefined} className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep dark:muted-on-tint">
            <Icon icon={Pin} size={12} />
            {t("pinned")}
          </span>
        ) : null}
        {a.scheduledFor ? <span className="shrink-0 rounded-pill bg-info-soft px-2.5 py-0.5 text-xs font-bold text-info-text">{t("scheduledFor", { date: `${f.date(a.scheduledFor)} ${f.time(a.scheduledFor)}` })}</span> : null}
      </div>
      <p dir="auto" className="whitespace-pre-wrap text-sm">
        {a.body}
      </p>
      {a.requireAck && a.publishedAt ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-subtle px-4 py-2.5 text-sm">
          <span>{t("ackRequired")}</span>
          {a.acked ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-success-text">
              <Icon icon={Check} size={16} />
              {t("acked")}
            </span>
          ) : (
            <Button size="sm" loading={ack.isPending} onClick={() => ack.mutate(a.id, { onError: fail })}>
              {t("ack")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-fg-secondary">{t("noAck")}</p>
      )}
      {a.ack ? (
        <div className="flex flex-col gap-2 rounded-2xl bg-subtle p-3">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold tabular">{f.number(a.ack.done)}</span>
              {t("ackOf", { total: f.number(a.ack.total), waiting: f.number(a.ack.total - a.ack.done) })}
            </span>
            {a.ack.lastReminderAt ? <span className="font-normal text-fg-secondary">{t("reminded", { time: f.listTime(a.ack.lastReminderAt) })}</span> : null}
          </div>
          <Progress value={a.ack.total ? (a.ack.done / a.ack.total) * 100 : 0} label={t("ackCount", { done: a.ack.done, total: a.ack.total })} />
          {a.ack.pending.length ? (
            <p className="text-xs text-fg-secondary">
              {t("pending")}: {a.ack.pending.map((p) => p.name).join("، ")}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" disabled={!a.canRemind} loading={remind.isPending} onClick={() => remind.mutate(a.id, { onSuccess: () => toast({ title: t("reminderSent") }), onError: fail })}>
              <Icon icon={BellRing} size={16} />
              {t("remind")}
            </Button>
            {!a.canRemind && a.ack.pending.length ? <span className="text-xs text-fg-secondary">{t("remindLimit")}</span> : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

function Composer({ source, audiences }: { source: MsgSource; audiences: { kind: "workspace" | "subset"; label: string; memberIds: string[] }[] }) {
  const t = useTranslations("Msg.announcements");
  const tMsg = useTranslations("Msg");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("0");
  const [ackRequired, setAck] = useState(false);
  const [pinDays, setPinDays] = useState("0");
  const [scheduled, setScheduled] = useState(false);
  const [day, setDay] = useState(getPlannerToday());
  const [time, setTime] = useState("09:00");
  const [opId, setOpId] = useState(newClientOpId);
  const publish = useMessagingMutation((repo, input: Parameters<typeof repo.announcements.publish>[0]) => repo.announcements.publish(input));
  const ready = title.trim() && body.trim();
  const submit = () => {
    if (!ready) return;
    const chosen = audiences[Number(audience)] ?? audiences[0]!;
    publish.mutate(
      {
        workspace: source,
        title,
        body,
        audience: chosen,
        pinDays: Number(pinDays) || null,
        requireAck: ackRequired,
        scheduleAt: scheduled ? instantAtTime(day, time) : null,
        clientOpId: opId,
      },
      {
        onSuccess: () => {
          toast({ title: scheduled ? t("scheduled") : t("published") });
          setTitle("");
          setBody("");
          setOpId(newClientOpId());
        },
        onError: (e) => toast({ title: errorText(tMsg as never, e), tone: "danger" }),
      },
    );
  };
  return (
    <SignatureCard
      as="section"
      aria-labelledby="an-compose"
      action={<SignatureCardAction icon={Send} mirror label={scheduled ? t("schedule") : t("publish")} disabled={!ready || publish.isPending} onClick={submit} />}
      contentClassName="gap-3"
      className="xl:sticky xl:top-4"
    >
      <h2 id="an-compose" className="type-title">
        {t("compose")}
      </h2>
      <Field>
        <FieldLabel>{t("fieldTitle")}</FieldLabel>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </Field>
      <Field>
        <FieldLabel>{t("fieldBody")}</FieldLabel>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} dir="auto" />
      </Field>
      <Field>
        <FieldLabel>{t("audience")}</FieldLabel>
        <Select value={audience} onValueChange={setAudience}>
          {audiences.map((a, i) => (
            <SelectItem key={i} value={String(i)}>
              {a.kind === "workspace" ? t("wholeWorkspace", { workspace: a.label }) : a.label}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Switch label={t("requireAck")} checked={ackRequired} onCheckedChange={setAck} />
      <Field>
        <FieldLabel>{t("pin")}</FieldLabel>
        <Select value={pinDays} onValueChange={setPinDays}>
          {["0", "3", "7", "14"].map((d) => (
            <SelectItem key={d} value={d}>
              {d === "0" ? t("noPin") : t("pinDays", { count: Number(d) })}
            </SelectItem>
          ))}
        </Select>
      </Field>
      <Switch label={t("scheduleLater")} checked={scheduled} onCheckedChange={setScheduled} />
      {scheduled ? (
        <div className="flex flex-wrap gap-2">
          <Input type="date" dir="ltr" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={t("date")} />
          <Input type="time" dir="ltr" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} aria-label={t("time")} />
        </div>
      ) : null}
      <p className="text-xs text-fg-secondary">{t("notChat")}</p>
    </SignatureCard>
  );
}
