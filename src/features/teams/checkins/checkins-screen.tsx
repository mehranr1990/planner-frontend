"use client";

import { ArrowRight, Bell, Check, MessageSquare, Pencil, Plus, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { Progress } from "@/design-system/feedback/progress";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import type { CheckinAnswers, CheckinReply, CheckinWeek, TeamPerson } from "@/data/team-domain";
import { RepositoryError } from "@/data/repositories";
import { useCheckinActions, useCheckinWeek, useDoneByMe, useTeamTaskActions } from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { teamTaskHref } from "../source-chip";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";

/*
 * TM-09 · Check-ins (/teams/[id]/check-ins). Three work questions (Did ·
 * Next · Blocked by), weekly; no mood, no energy, no scores, no streaks.
 * Your check-in = signature card, notch Send check-in (then Edit check-in
 * until closing); suggestion chips = tasks I completed this week in this team
 * (nothing from Personal). Replies = product cards, newest first, with a
 * comment thread and "Make task from blocker". Who replied = counts and
 * avatars only; Leads remind non-responders once per week. Closed weeks are
 * read-only; a missing reply may be sent late for 24h ("late" only to me).
 * Viewers read replies, no form.
 */

const EMPTY: CheckinAnswers = { did: "", next: "", blocked: "" };
const QUESTIONS = ["did", "next", "blocked"] as const;

function useClosing(data: Pick<CheckinWeek, "closesAt" | "schedule">) {
  const format = useProjectFormat();
  return {
    day: format.day(data.closesAt.slice(0, 10), "weekdayShort"),
    time: convertDigits(data.schedule.closesTime, format.digits),
  };
}

export function CheckinsScreen() {
  const t = useTranslations("Checkins");
  const format = useProjectFormat();
  const { team, demo } = useTeam();
  const [week, setWeek] = useState<string>();
  const query = useCheckinWeek(team.id, week, teamDemoAccessOptions(demo));
  const data = query.data;

  const header = (
    <TeamPageHeader
      module="checkins"
      title={t("title")}
      subtitle={data ? <Subtitle data={data} /> : undefined}
      actions={
        data && data.previous.length ? (
          <Segmented<string>
            label={t("weeks")}
            value={data.week}
            onValueChange={(value) => setWeek(value === data.current.week ? undefined : value)}
            options={[...data.previous]
              .reverse()
              .concat(data.current)
              .map((item) => ({ value: item.week, label: t("weekLabel", { n: format.number(item.weekNumber) }) }))}
          />
        ) : null
      }
    />
  );

  if (query.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void query.refetch()} />
      </>
    );
  }
  if (!data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  return (
    <>
      {header}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_minmax(16rem,20rem)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2 xl:col-span-1">
          <YourCheckin key={data.week} data={data} onCurrent={() => setWeek(undefined)} />
        </div>
        <section aria-label={t("title")} className="flex min-w-0 flex-col gap-3">
          {data.replies.length ? (
            data.replies.map((reply) => <ReplyCard key={reply.id} reply={reply} data={data} />)
          ) : (
            <ProductCard>
              <p className="text-sm text-fg-muted">{t("noReplies")}</p>
            </ProductCard>
          )}
        </section>
        <WhoReplied data={data} />
      </div>
    </>
  );
}

function Subtitle({ data }: { data: CheckinWeek }) {
  const t = useTranslations("Checkins");
  const closing = useClosing(data);
  return <>{t("subtitle", closing)}</>;
}

// ── Your check-in (signature) ────────────────────────────────────────────

function YourCheckin({ data, onCurrent }: { data: CheckinWeek; onCurrent: () => void }) {
  const t = useTranslations("Checkins");
  const format = useProjectFormat();
  const { team, capabilities } = useTeam();
  const actions = useCheckinActions(team.id);
  const closing = useClosing(data);
  const sentReply = data.mine.reply;
  const [editing, setEditing] = useState(data.mine.state === "missing");
  const [draft, setDraft] = useState<CheckinAnswers>(sentReply?.answers ?? EMPTY);
  const suggestions = useDoneByMe(team.id, data.week, data.can.reply && editing);
  const titleId = "your-checkin-title";

  if (!capabilities.createTask && data.mine.state === "missing") {
    // Viewers: read replies, no form.
    return (
      <ProductCard as="section" aria-label={t("title")}>
        <p className="text-sm text-fg-secondary">{t("viewer")}</p>
      </ProductCard>
    );
  }

  const send = (input: CheckinAnswers | { skip: true }) => {
    if (!("skip" in input) && !input.did.trim() && !input.next.trim()) {
      toast({ title: t("toast.empty"), tone: "danger" });
      return;
    }
    actions.reply.mutate(
      { week: data.week, input },
      {
        onSuccess: () => {
          toast({ title: "skip" in input ? t("toast.skipped") : t("toast.sent") });
          setEditing(false);
        },
        onError: (error) =>
          toast({
            title: error instanceof RepositoryError && error.code === "conflict" ? t("toast.closed") : t("toast.failed"),
            tone: "danger",
          }),
      },
    );
  };

  const showForm = editing && data.can.reply;
  const action = showForm ? (
    <SignatureCardAction icon={Send} mirror label={t("send")} disabled={actions.reply.isPending} onClick={() => send(draft)} />
  ) : data.can.reply ? (
    <SignatureCardAction
      icon={Pencil}
      label={t("edit")}
      onClick={() => {
        setDraft(sentReply?.answers ?? EMPTY);
        setEditing(true);
      }}
    />
  ) : data.week !== data.current.week ? (
    // A closed past week: the notch leads back to this week (never empty).
    <SignatureCardAction
      icon={ArrowRight}
      mirror
      variant="neutral"
      label={t("backToCurrent", { n: format.number(data.current.weekNumber) })}
      onClick={onCurrent}
    />
  ) : (
    <SignatureCardAction icon={Pencil} label={t("edit")} disabled />
  );

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    send(draft);
  };

  return (
    <SignatureCard action={action} as="section" aria-labelledby={titleId} contentClassName="gap-3">
      <SignatureCardHeader className="flex-col items-start gap-0.5">
        <h2 id={titleId} className="text-xs font-bold tracking-wide text-scope-deep uppercase">
          {t("yours", { n: format.number(data.weekNumber) })}
        </h2>
        <p className="text-xs text-fg-secondary">{t("yoursHint", { team: team.name })}</p>
      </SignatureCardHeader>

      {showForm ? (
        <form className="flex flex-col gap-3" onSubmit={onSubmit} aria-labelledby={titleId}>
          {data.status === "late" ? <p className="text-xs text-fg-secondary">{t("lateHint")}</p> : null}
          {QUESTIONS.map((key) => (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={`checkin-${key}`} className="text-sm font-bold text-fg">
                {t(key)}
              </label>
              <Textarea
                id={`checkin-${key}`}
                dir="auto"
                rows={key === "did" ? 3 : 2}
                value={draft[key]}
                placeholder={
                  key === "did" ? t("didPlaceholder") : key === "next" ? t("nextPlaceholder") : t("optional")
                }
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
              />
              {key === "did" && suggestions.data?.length ? (
                <div role="group" aria-label={t("suggestions")} className="flex flex-wrap gap-1.5">
                  {suggestions.data.map((task) => {
                    const added = draft.did.split("\n").some((line) => line.trim() === task.title);
                    return (
                      <button
                        key={task.id}
                        type="button"
                        aria-pressed={added}
                        aria-label={t("addSuggestion", { title: task.title })}
                        onClick={() =>
                          !added &&
                          setDraft((current) => ({
                            ...current,
                            did: current.did.trim() ? `${current.did.trimEnd()}\n${task.title}` : task.title,
                          }))
                        }
                        className="inline-flex items-center gap-1 rounded-full bg-scope-soft px-2.5 py-1 text-xs font-semibold text-scope-deep focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                      >
                        <Icon icon={Plus} size={12} />
                        <bdi>{task.title}</bdi>
                        <Icon icon={Check} size={12} className={added ? undefined : "opacity-40"} />
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {data.status === "open" && data.mine.state !== "skipped" ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => send({ skip: true })}>
                {t("skip")}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" size="sm" disabled={actions.reply.isPending}>
              {t("send")}
            </Button>
          </div>
        </form>
      ) : data.mine.state === "skipped" ? (
        <p className="text-sm text-fg-secondary">{t("skipped")}</p>
      ) : sentReply ? (
        <>
          {data.status === "open" ? (
            <p className="flex items-center gap-2 rounded-row bg-canvas px-3 py-2 text-sm font-semibold text-fg">
              <Icon icon={Check} size={16} className="text-scope-deep" />
              {t("sent", closing)}
            </p>
          ) : null}
          {sentReply.late ? (
            <span className="w-fit rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-fg-secondary">{t("late")}</span>
          ) : null}
          <ReplyAnswers reply={sentReply} />
          <CommentThread reply={sentReply} data={data} />
        </>
      ) : (
        <p className="text-sm text-fg-secondary">{data.status === "closed" ? t("missed") : t("closed")}</p>
      )}
      {data.status === "closed" && sentReply ? <p className="text-xs text-fg-muted">{t("closed")}</p> : null}
    </SignatureCard>
  );
}

// ── Replies (product cards) ──────────────────────────────────────────────

function lines(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function ReplyAnswers({ reply }: { reply: CheckinReply }) {
  const t = useTranslations("Checkins");
  return (
    <dl className="flex flex-col gap-2">
      {QUESTIONS.filter((key) => reply.answers[key].trim()).map((key) => (
        <div key={key} className="flex flex-col gap-0.5">
          <dt className={cn("text-xs font-bold uppercase", key === "blocked" ? "text-danger-text" : "text-fg-secondary")}>
            {t(`labels.${key}`)}
          </dt>
          <dd>
            <ul className={cn("list-inside list-disc text-sm", key === "blocked" ? "text-danger-text" : "text-fg")}>
              {lines(reply.answers[key]).map((line, index) => (
                <li key={index} dir="auto">
                  {line}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReplyCard({ reply, data }: { reply: CheckinReply; data: CheckinWeek }) {
  const format = useProjectFormat();
  const headingId = `reply-${reply.id}`;
  return (
    <ProductCard as="article" aria-labelledby={headingId} className="gap-3">
      <div className="flex items-center gap-2.5">
        <Avatar name={reply.person.name} initials={reply.person.initials} size={32} tone="team" decorative />
        <h3 id={headingId} className="min-w-0 flex-1 truncate text-sm font-bold text-fg">
          <bdi>{reply.person.name}</bdi>
        </h3>
        <span className="text-xs text-fg-muted">{format.day(reply.sentAt.slice(0, 10), "weekdayShort")}</span>
      </div>
      <ReplyAnswers reply={reply} />
      <CommentThread reply={reply} data={data} />
    </ProductCard>
  );
}

function CommentThread({ reply, data }: { reply: CheckinReply; data: CheckinWeek }) {
  const t = useTranslations("Checkins");
  const format = useProjectFormat();
  const router = useRouter();
  const { team } = useTeam();
  const actions = useCheckinActions(team.id);
  const taskActions = useTeamTaskActions(team.id);
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [madeTask, setMadeTask] = useState(false);
  const blocker = reply.answers.blocked.trim();

  const makeTask = () =>
    taskActions.create.mutate(
      { title: lines(blocker)[0] ?? blocker },
      {
        onSuccess: (task) => {
          setMadeTask(true);
          toast({
            title: t("taskCreated"),
            tone: "success",
            action: { label: t("openTask"), altText: t("openTask"), onClick: () => router.push(teamTaskHref(team.id, task)) },
          });
        },
        onError: () => toast({ title: t("toast.failed"), tone: "danger" }),
      },
    );

  return (
    <div className="flex flex-col gap-2">
      {reply.comments.length ? (
        <ul className="flex flex-col gap-2 border-s-2 border-border ps-3">
          {reply.comments.map((comment) => (
            <li key={comment.id} className="text-sm">
              <span className="font-bold text-fg">
                <bdi>{comment.author.name}</bdi>
              </span>{" "}
              <span className="text-xs text-fg-muted">{format.relative(comment.at)}</span>
              <p dir="auto" className="text-fg-secondary">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {data.can.comment ? (
          <Button type="button" variant="secondary" size="sm" className="gap-1.5" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon icon={MessageSquare} size={14} />
            {reply.comments.length ? t("comments", { count: reply.comments.length }) : t("comment")}
          </Button>
        ) : null}
        {blocker && data.can.makeTask && reply.person.id !== "me" ? (
          <Button type="button" variant="secondary" size="sm" disabled={madeTask || taskActions.create.isPending} onClick={makeTask}>
            {madeTask ? t("taskCreated") : t("makeTask")}
          </Button>
        ) : null}
      </div>
      {open ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim()) return;
            actions.comment.mutate(
              { replyId: reply.id, body },
              {
                onSuccess: () => {
                  setBody("");
                  setOpen(false);
                  toast({ title: t("toast.commented") });
                },
                onError: () => toast({ title: t("toast.failed"), tone: "danger" }),
              },
            );
          }}
        >
          <Textarea
            dir="auto"
            rows={2}
            aria-label={t("commentLabel", { name: reply.person.name })}
            placeholder={t("commentPlaceholder")}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            autoFocus
          />
          <Button type="submit" size="sm" disabled={!body.trim() || actions.comment.isPending}>
            {t("postComment")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

// ── Who replied (counts only) ────────────────────────────────────────────

function People({ people }: { people: readonly TeamPerson[] }) {
  return (
    <span className="flex">
      {people.map((person) => (
        <Avatar key={person.id} name={person.name} initials={person.initials} size={32} tone="team" className="-ms-1.5 size-6 text-[10px] ring-2 ring-surface first:ms-0" />
      ))}
    </span>
  );
}

function WhoReplied({ data }: { data: CheckinWeek }) {
  const t = useTranslations("Checkins");
  const format = useProjectFormat();
  const { team } = useTeam();
  const actions = useCheckinActions(team.id);
  const total = data.replied.length + data.notYet.length;
  const off = data.notYet.filter((entry) => entry.off);
  const blockers = [...data.replies, ...(data.mine.reply ? [data.mine.reply] : [])].filter((reply) => reply.answers.blocked.trim());
  const repliedText = t("repliedCount", { replied: format.number(data.replied.length), total: format.number(total) });

  return (
    <ProductCard as="aside" aria-labelledby="who-replied-title" className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="who-replied-title" className="type-title text-fg">
          {t("weekLabel", { n: format.number(data.weekNumber) })}
        </h2>
        <span className="text-xs text-fg-secondary">{repliedText}</span>
      </div>
      <Progress value={total ? (data.replied.length / total) * 100 : 0} label={repliedText} size="sm" />
      {data.replied.length ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
          <People people={data.replied} />
          {t("replied")}
        </p>
      ) : null}
      {data.notYet.length ? (
        <p className="flex flex-wrap items-center gap-2 text-xs text-fg-secondary">
          <People people={data.notYet.map((entry) => entry.person)} />
          {[t("notYet"), ...off.map((entry) => t("isOff", { name: entry.person.name }))].join(" · ")}
        </p>
      ) : null}
      {data.can.remind && data.remindable > 0 ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-fit gap-1.5"
          disabled={data.remindedAt !== null || actions.remind.isPending}
          onClick={() =>
            actions.remind.mutate(data.week, {
              onSuccess: () => toast({ title: t("reminded") }),
              onError: () => toast({ title: t("toast.failed"), tone: "danger" }),
            })
          }
        >
          <Icon icon={Bell} size={14} />
          {data.remindedAt ? t("remindedOnce") : t("remind", { count: data.remindable, n: format.number(data.remindable) })}
        </Button>
      ) : null}
      <h3 className="text-xs font-bold tracking-wide text-fg-secondary uppercase">
        {t("blockers", { n: format.number(blockers.length) })}
      </h3>
      {blockers.length ? (
        <ul className="flex flex-col gap-2">
          {blockers.map((reply) => (
            <li key={reply.id} className="flex items-center gap-2 rounded-row bg-danger-soft px-3 py-2.5 text-sm font-semibold text-danger-text">
              <span dir="auto" className="min-w-0 flex-1">
                {lines(reply.answers.blocked)[0]}
              </span>
              <span className="text-xs" aria-label={reply.person.name}>
                {reply.person.initials}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">{t("noBlockers")}</p>
      )}
    </ProductCard>
  );
}
