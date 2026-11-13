"use client";

import { Check, CircleCheck, MessageCircle, Plus, Receipt, Vote } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useCreateTask } from "@/data/queries";
import type { ActivityDetail, ChecklistItem, Rsvp } from "@/data/social-domain";
import { useActivity, useActivityFileActions, useActivityFiles, useSocialMutation } from "@/data/social-queries";
import { FilesView } from "@/features/projects/files/files-screen";
import { SocialError } from "@/data/social-repositories";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { useOpenSocialConversation } from "../group/group-chat";
import { socialHref } from "../paths";
import { isUnsupported, PersonAvatar, RsvpTag, SocialPageHeader, SocialUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";
import { RsvpButtons, useActivityText } from "./activity-parts";

/*
 * SO-05 · Activity (/social/activities/[id]). Independent or group-owned;
 * multi-day itinerary; RSVP signature card (notch Confirm RSVP when
 * unanswered, else Change RSVP) with capacity + waitlist (12 h offer, S3);
 * folder tabs Itinerary · Checklist (items → my Personal tasks) · People ·
 * Files; Chat and Expenses are buttons (Messages engine, SO-07). Going /
 * Maybe appear in the Personal calendar as projections; a private time
 * block is optional. States: full, guest view, cancelled, past (read-only).
 */
export function ActivityScreen() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("Social");
  const activity = useActivity(id);
  const text = useActivityText();
  const openChat = useOpenSocialConversation();
  if (activity.isError) {
    if (isUnsupported(activity.error)) return <SocialUnsupported />;
    if (activity.error instanceof SocialError && activity.error.code === "not-found") return <AccessState kind="social-not-available" />;
    return <ErrorState onRetry={() => void activity.refetch()} />;
  }
  if (!activity.data) return <AccessLoading />;
  const a = activity.data;
  // The server closes RSVP once the activity is over: past = read-only.
  const past = a.status === "planned" && !a.capabilities.rsvp;
  const chatPeople = a.attendees.filter((x) => x.rsvp !== "declined").map((x) => x.person.id);

  return (
    <>
      <SocialPageHeader
        group={a.group && !a.isGuest ? a.group : null}
        trail={[{ label: t("activities.title"), href: a.group && !a.isGuest ? socialHref.group(a.group.id, "activities") : socialHref.activities }, { label: a.title }]}
        title={<bdi>{a.title}</bdi>}
        titleAddon={
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg-secondary">
            <span className="rounded-pill bg-scope-soft px-2.5 py-0.5 text-xs font-bold text-scope-deep">{t(`templates.${a.template}`)}</span>
            <span>{text.dates(a)}</span>
          </span>
        }
        actions={
          <>
            {a.pollIds.length > 0 ? (
              <Button asChild variant="secondary" className="gap-2">
                <Link href={socialHref.poll(a.id)}>
                  <Icon icon={Vote} size={16} />
                  {t("activity.poll")}
                </Link>
              </Button>
            ) : null}
            <Button variant="secondary" className="gap-2" onClick={() => void openChat(`activity:${a.id}`, a.title, chatPeople)}>
              <Icon icon={MessageCircle} size={16} />
              {t("activity.chat")}
            </Button>
            <Button asChild variant="secondary" className="gap-2">
              <Link href={socialHref.expenses({ kind: "activity", id: a.id })}>
                <Icon icon={Receipt} size={16} />
                {t("activity.expenses")}
              </Link>
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-3">
        {a.isGuest ? <InlineAlert tone="info" title={t("activity.guestTitle")} description={t("activity.guestBody")} /> : null}
        {a.status === "cancelled" ? (
          <InlineAlert tone="danger" title={t("activity.cancelledTitle", { name: a.cancelledBy?.name ?? "" })} description={`${t("activity.cancelledReason", { reason: a.cancelReason ?? "" })} ${t("activity.cancelledNote")}`} />
        ) : null}
        {past ? <InlineAlert tone="info" title={t("activity.past")} /> : null}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <ActivityTabs activity={a} readOnly={past || a.status === "cancelled"} />
        <div className="flex min-w-0 flex-col gap-4">
          <RsvpCard activity={a} />
          {a.capabilities.cancel ? <CancelActivity activity={a} /> : null}
        </div>
      </div>
    </>
  );
}

function RsvpCard({ activity: a }: { activity: ActivityDetail }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const buttonsRef = useRef<HTMLDivElement>(null);
  const rsvp = useSocialMutation((repo, value: Exclude<Rsvp, "pending">) => repo.activities.rsvp(a.id, value));
  const waitlist = useSocialMutation((repo, action: "join" | "leave" | "accept") =>
    action === "join" ? repo.activities.joinWaitlist(a.id) : action === "leave" ? repo.activities.leaveWaitlist(a.id) : repo.activities.acceptOffer(a.id),
  );
  const block = useSocialMutation((repo, on: boolean) => repo.activities.setCalendarBlock(a.id, on));
  const counts = { going: a.goingCount, maybe: a.attendees.filter((x) => x.rsvp === "maybe").length };
  const full = a.capacity !== null && a.goingCount >= a.capacity && a.myRsvp !== "going";
  const pct = a.capacity ? Math.min(100, (a.goingCount / a.capacity) * 100) : null;
  const myOffer = a.waitlist[0]?.person.id === "me" ? a.waitlist[0].offeredUntil : null;
  const headline = a.myWaitlist !== null ? t("activity.onWaitlist", { n: format.number(a.myWaitlist) }) : t(`rsvp.${a.myRsvp}`);
  const notch =
    a.myRsvp === "pending" && !full && a.capabilities.rsvp ? (
      <SignatureCardAction label={t("activity.confirmRsvp")} icon={Check} disabled={rsvp.isPending} onClick={() => rsvp.mutate("going", { onError: (e) => toast({ title: errorText(e), tone: "danger" }) })} />
    ) : (
      <SignatureCardAction
        label={t("activity.changeRsvp")}
        icon={Check}
        disabled={!a.capabilities.rsvp}
        onClick={() => buttonsRef.current?.querySelector<HTMLButtonElement>("button:not([aria-pressed='true'])")?.focus()}
      />
    );
  return (
    <SignatureCard as="section" aria-labelledby="rsvp-title" contentClassName="flex flex-col gap-3" action={notch}>
      <p className="text-xs font-bold tracking-wide text-scope-deep uppercase">{t("activity.rsvpTitle")}</p>
      <h2 id="rsvp-title" className="pe-16 type-h2 text-fg">
        {headline}
      </h2>
      <p className="text-xs text-fg-secondary">
        {a.capacity !== null ? t("activity.capacity", { going: format.number(counts.going), capacity: format.number(a.capacity) }) : t("activity.goingNoCap", { going: format.number(counts.going) })}
        {a.waitlistCount > 0 ? ` · ${t("group.onWaitlist", { n: format.number(a.waitlistCount) })}` : ""}
        {counts.maybe > 0 ? ` · ${format.number(counts.maybe)} ${t("rsvp.maybe")}` : ""}
      </p>
      {pct !== null ? (
        <div role="img" aria-label={t("activity.capacity", { going: format.number(counts.going), capacity: format.number(a.capacity!) })} className="h-2 overflow-hidden rounded-pill bg-subtle">
          <span className="block h-full rounded-pill bg-scope-deep" style={{ inlineSize: `${pct}%` }} />
        </div>
      ) : null}
      {myOffer ? (
        <div className="flex flex-col gap-2 rounded-row bg-scope-soft p-3">
          <p className="text-sm font-semibold text-scope-deep">{t("activity.offer", { time: format.relative(myOffer) })}</p>
          <Button size="sm" onClick={() => waitlist.mutate("accept", { onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}>
            {t("activity.acceptOffer")}
          </Button>
        </div>
      ) : full && a.myWaitlist === null && a.capabilities.rsvp ? (
        <div className="flex flex-col items-start gap-2 rounded-row bg-warning-soft p-3">
          <p className="text-sm font-bold text-warning-text">{t("activity.full")}</p>
          <p className="text-sm text-warning-text">{t("activity.fullBody", { going: format.number(a.goingCount), capacity: format.number(a.capacity!) })}</p>
          <Button size="sm" onClick={() => waitlist.mutate("join")}>
            {t("activity.joinWaitlist")}
          </Button>
        </div>
      ) : null}
      {a.capabilities.rsvp ? (
        <div ref={buttonsRef}>
          <RsvpButtons activity={a} />
        </div>
      ) : null}
      {a.myWaitlist !== null && !myOffer ? (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => waitlist.mutate("leave")}>
          {t("activity.leaveWaitlist")}
        </Button>
      ) : null}
      {a.waitlist.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3">
          <h3 className="text-xs font-bold tracking-wide text-fg-muted uppercase">{t("activity.waitlistTitle")}</h3>
          <ol className="flex flex-col gap-1">
            {a.waitlist.map((w, i) => (
              <li key={w.person.id} className="flex items-center gap-2 py-1">
                <PersonAvatar person={w.person} />
                <bdi className="min-w-0 flex-1 truncate text-sm font-semibold">{w.person.name}</bdi>
                {w.offeredUntil ? <span className="text-xs text-scope-deep">{t("activity.offeredUntil", { time: format.relative(w.offeredUntil) })}</span> : null}
                <span className="text-xs font-bold text-fg-muted tabular">#{format.number(i + 1)}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-fg-muted">{t("activity.waitlistNote")}</p>
        </div>
      ) : null}
      {a.myRsvp === "going" || a.myRsvp === "maybe" ? (
        <div className="flex flex-col gap-1 border-t border-line pt-3">
          <Switch checked={a.calendarBlock} disabled={!a.capabilities.rsvp} onCheckedChange={(on) => block.mutate(on)} label={t("activity.privateBlock")} />
          <p className="text-xs text-fg-muted">{t("activity.calendarHint")}</p>
        </div>
      ) : null}
      {a.recurringWeekly ? <p className="text-xs font-semibold text-fg-secondary">{t("activity.weeklyNote")}</p> : null}
    </SignatureCard>
  );
}

function ActivityTabs({ activity: a, readOnly }: { activity: ActivityDetail; readOnly: boolean }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const text = useActivityText();
  const done = a.checklist.filter((c) => c.done).length;
  const goingPeople = a.attendees.filter((x) => x.rsvp !== "declined").length;
  return (
    <FolderTabsCard
      label={t("activity.tabs.label")}
      defaultValue="itinerary"
      tabs={[
        { value: "itinerary", label: t("activity.tabs.itinerary"), count: text.span(a), content: <Itinerary activity={a} readOnly={readOnly} /> },
        { value: "checklist", label: t("activity.tabs.checklist"), count: `${format.number(done)}/${format.number(a.checklist.length)}`, content: <Checklist activity={a} readOnly={readOnly} /> },
        { value: "people", label: t("activity.tabs.people"), count: format.number(goingPeople), content: <People activity={a} /> },
        {
          value: "files",
          label: t("activity.tabs.files"),
          count: format.number(a.files.length),
          content: <ActivityFiles activity={a} />,
        },
      ]}
    />
  );
}

/*
 * Activity files: exactly the PJ-10 Files component through its scope seam
 * (rows, upload / scan / blocked states, versions, preview with Download).
 * Attendees who did not decline may upload while the activity is planned;
 * no linked tasks, no guest-only folders (guests see the activity's files).
 */
function ActivityFiles({ activity: a }: { activity: ActivityDetail }) {
  const library = useActivityFiles(a.id);
  const actions = useActivityFileActions(a.id);
  if (library.isError) return isUnsupported(library.error) ? <SocialUnsupported compact /> : <ErrorState onRetry={() => void library.refetch()} />;
  return (
    <FilesView
      scope={{
        scope: "social",
        header: (toolbar) => <div className="flex flex-wrap items-center justify-end gap-2">{toolbar}</div>,
        library,
        actions,
        canUpload: a.capabilities.uploadFiles,
        canManage: a.capabilities.edit,
        guest: false,
        demo: null,
        tasks: [],
        taskHref: () => "#",
      }}
    />
  );
}

function Itinerary({ activity: a, readOnly }: { activity: ActivityDetail; readOnly: boolean }) {
  const t = useTranslations("Social.activity");
  const format = useSocialFormat();
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      {a.description ? <p className="text-sm text-fg-secondary">{a.description}</p> : null}
      {a.itinerary.length === 0 ? <p className="p-2 text-sm text-fg-secondary">{t("noItinerary")}</p> : null}
      {a.itinerary.map((day) => (
        <section key={day.day} aria-label={format.day(day.day, "full")} className="flex flex-col gap-2">
          <h3 className="text-xs font-bold tracking-wide text-fg-muted uppercase">{format.day(day.day, "full")}</h3>
          {day.items.length === 0 ? <p className="text-sm text-fg-secondary">{t("noItems")}</p> : null}
          <ol className="flex flex-col gap-2">
            {day.items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 rounded-row bg-subtle px-3 py-3">
                <span dir="ltr" className="w-12 shrink-0 text-sm font-bold text-fg tabular">
                  {item.time ? convertDigits(item.time, format.digits) : "—"}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi className="text-sm font-bold text-fg">{item.title}</bdi>
                  {item.place || item.note ? <bdi className="text-xs text-fg-secondary">{[item.place, item.note].filter(Boolean).join(" · ")}</bdi> : null}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {a.capabilities.edit && !readOnly ? (
        <Button variant="secondary" size="sm" className="gap-1.5 self-start" aria-haspopup="dialog" onClick={() => setAdding(true)}>
          <Icon icon={Plus} size={14} />
          {t("addItem")}
        </Button>
      ) : null}
      {adding ? <AddItemDialog activity={a} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}

function AddItemDialog({ activity: a, onClose }: { activity: ActivityDetail; onClose: () => void }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const days: string[] = [];
  for (let d = a.startDay; d <= a.endDay && days.length < 31; ) {
    days.push(d);
    const next = new Date(`${d}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    d = next.toISOString().slice(0, 10);
  }
  const [day, setDay] = useState(days[0]!);
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const add = useSocialMutation((repo) => repo.activities.addItineraryItem(a.id, day, { title, time: time.trim() || null, place, note }));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("activity.addItem")}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            add.mutate(undefined, { onSuccess: onClose });
          }}
        >
          <Field>
            <FieldLabel>{t("activity.itemDay")}</FieldLabel>
            <Select value={day} onValueChange={setDay}>
              {days.map((d, i) => (
                <SelectItem key={d} value={d}>
                  {`${t("activity.dayN", { n: format.number(i + 1) })} · ${format.day(d)}`}
                </SelectItem>
              ))}
            </Select>
          </Field>
          <Field>
            <FieldLabel>{t("activity.itemTitle")}</FieldLabel>
            <Input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field>
              <FieldLabel>{t("activity.itemTime")}</FieldLabel>
              <Input dir="ltr" placeholder="09:00" className="tabular" value={time} onChange={(event) => setTime(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel>{t("activity.itemPlace")}</FieldLabel>
              <Input dir="auto" value={place} onChange={(event) => setPlace(event.target.value)} />
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("activity.itemNote")}</FieldLabel>
            <Input dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {add.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(add.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Checklist({ activity: a, readOnly }: { activity: ActivityDetail; readOnly: boolean }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [title, setTitle] = useState("");
  const toggle = useSocialMutation((repo, itemId: string) => repo.checklist.toggle(a.id, itemId));
  const claim = useSocialMutation((repo, itemId: string) => repo.checklist.claim(a.id, itemId));
  const add = useSocialMutation((repo, value: string) => repo.checklist.add(a.id, value));
  const link = useSocialMutation((repo, input: { itemId: string; taskId: string }) => repo.checklist.linkTask(a.id, input.itemId, input.taskId));
  const createTask = useCreateTask();
  const makeTask = (item: ChecklistItem) =>
    createTask.mutate(
      { title: item.title, date: a.startDay, scope: "personal" },
      {
        onSuccess: (task) => link.mutate({ itemId: item.id, taskId: task.id }, { onSuccess: () => toast({ title: t("activity.taskCreated"), tone: "success" }) }),
        onError: (e) => toast({ title: errorText(e), tone: "danger" }),
      },
    );
  const canWrite = !readOnly && !a.isGuest;
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {a.checklist.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2">
            <Checkbox
              checked={item.done}
              disabled={!canWrite}
              onCheckedChange={() => toggle.mutate(item.id, { onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}
              label={<bdi className={cn("text-sm font-semibold", item.done && "text-fg-muted line-through")}>{item.title}</bdi>}
              wrapperClassName="min-w-0 flex-1"
            />
            <span className="flex items-center gap-1.5 text-xs text-fg-secondary">
              {item.assignee ? (
                <>
                  <PersonAvatar person={item.assignee} />
                  <bdi>{item.assignee.id === "me" ? t("common.you") : item.assignee.name}</bdi>
                </>
              ) : (
                t("activity.unassigned")
              )}
            </span>
            {canWrite && (item.assignee === null || item.assignee.id === "me") && item.taskId === null ? (
              <Button size="sm" variant="ghost" onClick={() => claim.mutate(item.id)}>
                {item.assignee ? t("activity.unclaim") : t("activity.claim")}
              </Button>
            ) : null}
            {item.taskId ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-success-text">
                <Icon icon={CircleCheck} size={14} />
                {t("activity.taskLinked")}
              </span>
            ) : canWrite && !item.done && (item.assignee === null || item.assignee.id === "me") ? (
              <Button size="sm" variant="secondary" disabled={createTask.isPending} onClick={() => makeTask(item)}>
                {t("activity.makeTask")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canWrite ? (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            add.mutate(title, { onSuccess: () => setTitle("") });
          }}
        >
          <Input aria-label={t("activity.checklistNew")} placeholder={t("activity.checklistNew")} dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} className="h-10" />
          <Button type="submit" size="sm" variant="secondary" disabled={add.isPending}>
            {t("activity.checklistAdd")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function People({ activity: a }: { activity: ActivityDetail }) {
  const t = useTranslations("Social");
  const order: Rsvp[] = ["going", "maybe", "pending", "declined"];
  const sorted = [...a.attendees].sort((x, y) => order.indexOf(x.rsvp) - order.indexOf(y.rsvp) || x.person.name.localeCompare(y.person.name));
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {sorted.map((x) => (
        <li key={x.person.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2">
          <PersonAvatar person={x.person} />
          <span className="flex min-w-0 flex-1 flex-col">
            <bdi className="truncate text-sm font-semibold text-fg">{x.person.id === "me" ? t("common.you") : x.person.name}</bdi>
            <span className="text-xs text-fg-muted">{[x.organiser ? t("activity.organiserTag") : null, x.guest ? t("common.guest") : null].filter(Boolean).join(" · ")}</span>
          </span>
          <RsvpTag rsvp={x.rsvp} />
        </li>
      ))}
    </ul>
  );
}

function CancelActivity({ activity: a }: { activity: ActivityDetail }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useSocialMutation((repo) => repo.activities.cancel(a.id, reason));
  return (
    <>
      <Button variant="ghost" className="self-start text-danger-text" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {t("activity.cancel")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t("activity.cancelTitle", { title: a.title })} description={t("activity.cancelledNote")}>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!reason.trim()) return;
              cancel.mutate(undefined, {
                onSuccess: () => {
                  toast({ title: t("activity.cancelled") });
                  setOpen(false);
                },
              });
            }}
          >
            <Field>
              <FieldLabel>{t("activity.cancelReason")}</FieldLabel>
              <Textarea dir="auto" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
            {cancel.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(cancel.error)}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={!reason.trim() || cancel.isPending}>
                {t("activity.cancelConfirm")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
