"use client";

import { ArrowRight, FileText, Link2, MoreHorizontal, Plus, Sparkles, UserPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useRef, useState } from "react";
import { AccessLoading } from "@/components/feedback/access-state";
import { EmptyState, ErrorState } from "@/components/feedback/state-views";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Avatar } from "@/components/ui/avatar";
import { Button, IconButton } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction, SignatureCardHeader } from "@/design-system/surfaces/signature-card";
import type { FeedbackInbox, TeamPerson, TeamThanks, ThanksLink } from "@/data/team-domain";
import {
  useFeedbackInbox,
  useRecognitionActions,
  useTeamGoals,
  useTeamMembers,
  useTeamProjects,
  useTeamTasks,
  useThanksFeed,
} from "@/data/team-queries";
import { useProjectFormat } from "@/features/projects/format";
import { cn } from "@/lib/cn";
import { teamDemoAccessOptions } from "../demo-state";
import { listNames } from "../overview/updates-tabs";
import { useTeam } from "../team-gate";
import { TeamPageHeader } from "../team-page-header";
import { FeedbackDialogs, FeedbackTab, type FeedbackDialog } from "./feedback";

/*
 * TM-10 · Thanks & feedback (/teams/[id]/recognition). Thanks composer =
 * signature card (notch Send thanks): one or more teammates, a specific
 * note, an optional link to a task / goal / project I can see, visibility
 * Team (default) or Only the recipient(s). Feed = product cards, newest
 * first; private thanks only for writer and recipients; recipients may hide
 * one from the team feed, authors delete their own, Owner/Admin remove any
 * (audited). Feedback (private 1:1) sits beside the feed and owns the
 * Feedback view. No counts per person anywhere, no leaderboard.
 */

type View = "thanks" | "feedback";

export function RecognitionScreen() {
  const t = useTranslations("Recognition");
  const format = useProjectFormat();
  const { team, capabilities, demo } = useTeam();
  const canWrite = capabilities.createTask;
  const feed = useThanksFeed(team.id, teamDemoAccessOptions(demo));
  const inbox = useFeedbackInbox(team.id, canWrite);
  const [view, setView] = useState<View>("thanks");
  const [dialog, setDialog] = useState<FeedbackDialog>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const header = (
    <TeamPageHeader
      module="recognition"
      title={t("title")}
      actions={
        canWrite ? (
          <Segmented<View>
            label={t("view.label")}
            value={view}
            onValueChange={setView}
            options={[
              { value: "thanks", label: t("view.thanks") },
              {
                value: "feedback",
                // Open requests asked of me (my own inbox; never a count per person).
                label: inbox.data?.asked.length
                  ? t("view.feedbackCount", { n: format.number(inbox.data.asked.length) })
                  : t("view.feedback"),
              },
            ]}
          />
        ) : null
      }
    />
  );

  if (feed.isError) {
    return (
      <>
        {header}
        <ErrorState onRetry={() => void feed.refetch()} />
      </>
    );
  }
  if (!feed.data) {
    return (
      <>
        {header}
        <AccessLoading />
      </>
    );
  }

  if (view === "feedback" && canWrite) {
    return (
      <>
        {header}
        <FeedbackTab inbox={inbox.data} onOpen={setDialog} />
        <FeedbackDialogs dialog={dialog} onClose={() => setDialog(null)} />
      </>
    );
  }

  return (
    <>
      {header}
      <div
        className={cn(
          "grid min-w-0 gap-4 xl:items-start",
          canWrite
            ? "lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)_minmax(16rem,20rem)]"
            : "",
        )}
      >
        {canWrite ? (
          <div className="min-w-0 lg:col-span-2 xl:col-span-1">
            <ThanksComposer textRef={composerRef} />
          </div>
        ) : null}
        <section aria-label={t("feed")} className="flex min-w-0 flex-col gap-3">
          {!canWrite ? <p className="text-sm text-fg-secondary">{t("viewer")}</p> : null}
          {feed.data.length ? (
            feed.data.map((item) => <ThanksCard key={item.id} thanks={item} />)
          ) : (
            <EmptyState
              icon={Sparkles}
              title={t("empty.title")}
              description={t("empty.body")}
              primaryAction={
                canWrite ? (
                  <Button variant="secondary" onClick={() => composerRef.current?.focus()}>
                    {t("thanks")}
                  </Button>
                ) : undefined
              }
            />
          )}
        </section>
        {canWrite ? (
          <FeedbackSideCard
            inbox={inbox.data}
            onOpen={setDialog}
            onRequest={() => {
              setView("feedback");
            }}
          />
        ) : null}
      </div>
      <FeedbackDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

// ── Composer (signature) ─────────────────────────────────────────────────

function ThanksComposer({ textRef }: { textRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const t = useTranslations("Recognition");
  const format = useProjectFormat();
  const { team } = useTeam();
  const members = useTeamMembers(team.id);
  const actions = useRecognitionActions(team.id);
  const [toIds, setToIds] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [link, setLink] = useState<ThanksLink | null>(null);
  const [visibility, setVisibility] = useState<"team" | "private">("team");
  const ids = { title: useId(), text: useId(), vis: useId() };
  const people: readonly TeamPerson[] = (members.data ?? []).map((member) => member.person).filter((person) => person.id !== "me");
  const chosen = toIds.flatMap((id) => people.find((person) => person.id === id) ?? []);

  const send = () => {
    if (!chosen.length || !text.trim()) {
      toast({ title: t("toast.missing"), tone: "danger" });
      return;
    }
    actions.give.mutate(
      { toIds, text, visibility, link },
      {
        onSuccess: () => {
          toast({ title: t("toast.sent") });
          setToIds([]);
          setText("");
          setLink(null);
          setVisibility("team");
        },
        onError: () => toast({ title: t("toast.failed"), tone: "danger" }),
      },
    );
  };

  return (
    <SignatureCard
      as="section"
      aria-labelledby={ids.title}
      contentClassName="gap-3"
      action={<SignatureCardAction icon={ArrowRight} mirror label={t("send")} disabled={actions.give.isPending} onClick={send} />}
    >
      <SignatureCardHeader className="flex-col items-start gap-0.5">
        <h2 id={ids.title} className="text-xs font-bold tracking-wide text-scope-deep uppercase">
          {t("thanks")}
        </h2>
        <p className="text-xs text-fg-secondary">{t("composerHint")}</p>
      </SignatureCardHeader>
      <div role="group" aria-label={t("to")} className="flex flex-wrap items-center gap-1.5 rounded-row bg-canvas p-2">
        {chosen.map((person) => (
          <span key={person.id} className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 ps-1 pe-2 text-xs font-semibold text-fg">
            <Avatar name={person.name} initials={person.initials} size={32} tone="team" decorative className="size-5 text-[9px]" />
            <bdi>{person.name}</bdi>
            <button
              type="button"
              aria-label={t("removePerson", { name: person.name })}
              onClick={() => setToIds((current) => current.filter((id) => id !== person.id))}
              className="rounded-full text-fg-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              <Icon icon={X} size={12} />
            </button>
          </span>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="gap-1.5">
              <Icon icon={UserPlus} size={14} />
              {t("addPerson")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {people.map((person) => (
              <DropdownMenuCheckboxItem
                key={person.id}
                checked={toIds.includes(person.id)}
                onCheckedChange={(checked) =>
                  setToIds((current) => (checked ? [...current, person.id] : current.filter((id) => id !== person.id)))
                }
                onSelect={(event) => event.preventDefault()}
              >
                {person.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <label htmlFor={ids.text} className="sr-only">
        {t("text")}
      </label>
      <Textarea
        ref={textRef}
        id={ids.text}
        dir="auto"
        rows={4}
        value={text}
        placeholder={t("textPlaceholder")}
        onChange={(event) => setText(event.target.value)}
      />
      {link ? (
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-scope-soft px-2.5 py-1 text-xs font-semibold text-scope-deep">
          <Icon icon={Link2} size={12} />
          <bdi>{link.title}</bdi>
          <button
            type="button"
            aria-label={t("removeLink", { title: link.title })}
            onClick={() => setLink(null)}
            className="rounded-full focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            <Icon icon={X} size={12} />
          </button>
        </span>
      ) : (
        <LinkPicker onPick={setLink} />
      )}
      <div className="flex flex-col gap-1.5">
        <span id={ids.vis} className="text-xs font-semibold text-fg-secondary">
          {t("visibility.label")}
        </span>
        <Segmented<"team" | "private">
          label={t("visibility.label")}
          variant="neutral"
          value={visibility}
          onValueChange={setVisibility}
          options={[
            { value: "team", label: t("visibility.team", { team: team.name }) },
            {
              value: "private",
              label: chosen.length ? t("visibility.private", { name: listNames(chosen, format.locale) }) : t("visibility.recipient"),
            },
          ]}
        />
      </div>
    </SignatureCard>
  );
}

function LinkPicker({ onPick }: { onPick: (link: ThanksLink) => void }) {
  const t = useTranslations("Recognition");
  const { team } = useTeam();
  const tasks = useTeamTasks(team.id, { includeProjects: false });
  const goals = useTeamGoals(team.id);
  const projects = useTeamProjects(team.id);
  const groups: { kind: ThanksLink["kind"]; items: ThanksLink[] }[] = [
    { kind: "task", items: (tasks.data ?? []).slice(0, 8).map((task) => ({ kind: "task", id: task.id, title: task.title })) },
    { kind: "goal", items: (goals.data?.goals ?? []).map((goal) => ({ kind: "goal", id: goal.id, title: goal.title })) },
    { kind: "project", items: (projects.data ?? []).map((project) => ({ kind: "project", id: project.id, title: project.name })) },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="w-fit gap-1.5 text-scope-deep">
          <Icon icon={Plus} size={14} />
          {t("addLink")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
        {groups
          .filter((group) => group.items.length)
          .map((group) => (
            <div key={group.kind} role="group" aria-label={t(`linkGroups.${group.kind}`)}>
              <DropdownMenuLabel>{t(`linkGroups.${group.kind}`)}</DropdownMenuLabel>
              {group.items.map((item) => (
                <DropdownMenuItem key={`${item.kind}-${item.id}`} onSelect={() => onPick(item)}>
                  {item.title}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Feed (product cards) ─────────────────────────────────────────────────

function ThanksCard({ thanks }: { thanks: TeamThanks }) {
  const t = useTranslations("Recognition");
  const format = useProjectFormat();
  const { team } = useTeam();
  const actions = useRecognitionActions(team.id);
  const [confirm, setConfirm] = useState(false);
  const bold = (chunks: React.ReactNode) => <strong className="font-bold text-fg">{chunks}</strong>;
  const nameOf = (person: TeamPerson) => (person.id === "me" ? t("you") : person.name);
  const toMe = thanks.to.some((person) => person.id === "me");
  const visibilityChip =
    thanks.visibility === "team"
      ? t("chip.team")
      : toMe
        ? t("visibility.onlyYou")
        : t("visibility.private", { name: listNames(thanks.to, format.locale) });
  const can = thanks.can ?? { delete: false, hide: false, remove: false };
  const done = (title: string) => () => toast({ title });
  const failed = () => toast({ title: t("toast.failed"), tone: "danger" });

  return (
    <ProductCard as="article" aria-label={`${thanks.from.name} → ${listNames(thanks.to, format.locale)}`} className="gap-2.5">
      <div className="flex items-center gap-2.5">
        <Avatar name={thanks.from.name} initials={thanks.from.initials} size={32} tone="team" decorative />
        <p className="min-w-0 flex-1 text-sm text-fg">
          {t.rich("thanked", {
            from: nameOf(thanks.from),
            to: listNames(
              thanks.to.map((person) => ({ name: nameOf(person) })),
              format.locale,
            ),
            b: bold,
          })}
        </p>
        <span className="flex">
          {thanks.to.map((person) => (
            <Avatar
              key={person.id}
              name={person.name}
              initials={person.initials}
              size={32}
              tone="neutral"
              decorative
              className="-ms-1.5 size-6 text-[10px] ring-2 ring-surface first:ms-0"
            />
          ))}
        </span>
        {can.delete || can.hide || can.remove ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={MoreHorizontal} size="sm" variant="ghost" label={t("actions", { name: thanks.from.name })} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can.hide ? (
                <DropdownMenuItem
                  onSelect={() =>
                    actions.hide.mutate(
                      { thanksId: thanks.id, hidden: !thanks.hidden },
                      { onSuccess: done(thanks.hidden ? t("toast.shown") : t("toast.hidden")), onError: failed },
                    )
                  }
                >
                  {thanks.hidden ? t("show") : t("hide")}
                </DropdownMenuItem>
              ) : null}
              {can.delete ? (
                <DropdownMenuItem
                  onSelect={() => actions.remove.mutate(thanks.id, { onSuccess: done(t("toast.deleted")), onError: failed })}
                >
                  {t("delete")}
                </DropdownMenuItem>
              ) : null}
              {can.remove ? <DropdownMenuItem onSelect={() => setConfirm(true)}>{t("remove")}</DropdownMenuItem> : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <p dir="auto" className="text-sm text-fg">
        {thanks.text}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {thanks.link ? (
          <span
            data-scope={thanks.link.kind === "project" ? "project" : "team"}
            className="inline-flex items-center gap-1.5 rounded-full bg-scope-soft px-2.5 py-0.5 text-xs font-semibold text-scope-deep"
          >
            <span aria-hidden className="size-1.5 rounded-full bg-current" />
            <bdi>{thanks.link.title}</bdi>
          </span>
        ) : null}
        <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-fg-secondary">{visibilityChip}</span>
        {thanks.hidden ? (
          <span className="rounded-full bg-canvas px-2.5 py-0.5 text-xs font-semibold text-fg-secondary">{t("chip.hidden")}</span>
        ) : null}
        <span className="ms-auto text-xs text-fg-muted">{format.relative(thanks.at)}</span>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="destructive"
        title={t("removeTitle")}
        description={t("removeBody")}
        confirmLabel={t("remove")}
        onConfirm={() =>
          actions.remove.mutateAsync(thanks.id).then(() => {
            toast({ title: t("toast.removed") });
            setConfirm(false);
          })
        }
      />
    </ProductCard>
  );
}

// ── Feedback side card ───────────────────────────────────────────────────

function FeedbackSideCard({
  inbox,
  onOpen,
  onRequest,
}: {
  inbox: FeedbackInbox | undefined;
  onOpen: (dialog: FeedbackDialog) => void;
  onRequest: () => void;
}) {
  const t = useTranslations("TeamFeedback");
  const format = useProjectFormat();
  const bold = (chunks: React.ReactNode) => <strong className="font-bold text-fg">{chunks}</strong>;
  return (
    <ProductCard as="aside" aria-labelledby="feedback-side-title" className="gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="feedback-side-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <span className="text-xs text-fg-secondary">{t("privateTag")}</span>
      </div>
      <ul className="flex flex-col gap-2">
        {inbox?.asked.map((request) => (
          <li key={request.id} className="flex items-center gap-2.5 rounded-row bg-scope-soft/50 p-3">
            <Avatar name={request.from.name} initials={request.from.initials} size={32} tone="team" decorative />
            <div className="flex min-w-0 flex-1 flex-col text-xs">
              <p className="text-sm text-fg">{t.rich("askedYou", { name: request.from.name, b: bold })}</p>
              <span className="text-fg-secondary">
                {[request.about ? t("onAbout", { about: request.about }) : null, request.due ? t("due", { day: format.day(request.due, "weekdayShort") }) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <Button size="sm" onClick={() => onOpen({ kind: "write", request })}>
              {t("write")}
            </Button>
          </li>
        ))}
        {inbox?.received.map((note) => (
          <li key={note.id} className="flex items-center gap-2.5 rounded-row bg-canvas p-3">
            <Icon icon={FileText} size={16} className="shrink-0 text-fg-secondary" />
            <div className="flex min-w-0 flex-1 flex-col text-xs">
              <p className="text-sm text-fg">{t.rich("receivedFrom", { name: note.author.name, b: bold })}</p>
              <span className="text-fg-secondary">
                {[note.about ? t("onAbout", { about: note.about }) : null, t("private")].filter(Boolean).join(" · ")}
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: "read", note })}>
              {t("read")}
            </Button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" size="sm" className="w-fit gap-1.5" onClick={onRequest}>
        <Icon icon={Plus} size={14} />
        {t("request")}
      </Button>
    </ProductCard>
  );
}
