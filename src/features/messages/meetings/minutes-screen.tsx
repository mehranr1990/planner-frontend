"use client";

import { Check, ListChecks, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import type { ActionItem, Decision, MeetingDetail, Minutes } from "@/data/messaging-domain";
import { useMessagingRepository } from "@/data/messaging-provider";
import { newClientOpId, useMeeting, useMessagingMutation, useMinutes } from "@/data/messaging-queries";
import { useRepositories } from "@/data/provider";
import { projectHref, teamHref } from "@/features/navigation/contexts";
import { errorText } from "../message-dialogs";
import { messagesHref, sourceScope } from "../paths";
import { useMsgFormat } from "../format";
import { MeetingSourceChip, MinutesChip } from "./meeting-parts";

/*
 * MT-03 · Minutes: Draft (minute taker, explicit Save — OD-18) → In review (one reviewer — OD-17) →
 * Approved (with a required reason) → Final (organiser); Request changes returns
 * to Draft with a comment; versions kept. Decisions with who proposed them.
 * Action items → "Make task" ONLY on explicit user action (with a
 * confirmation): the task is created by the source workspace's own engine
 * (Personal / Project / Team, normal assignment) and the item links to it —
 * no copies. Reviewer signature card: notch = Approve minutes.
 */
export function MinutesScreen({ id }: { id: string }) {
  const meeting = useMeeting(id);
  const minutes = useMinutes(meeting.data ? id : undefined);
  if (meeting.isPending || (meeting.data && minutes.isPending)) return <AccessLoading />;
  if (meeting.isError || minutes.isError) return <AccessState kind="error" />;
  if (!meeting.data || !minutes.data) return <AccessState kind="msg-not-found" />;
  // The local draft restarts from every newly saved state (OD-18).
  const saved = minutes.data;
  return <MinutesBody key={JSON.stringify([saved.version, saved.status, saved.summary, saved.decisions, saved.actionItems])} meeting={meeting.data} minutes={saved} />;
}

function MinutesBody({ meeting: m, minutes: min }: { meeting: MeetingDetail; minutes: Minutes }) {
  const t = useTranslations("Msg.minutes");
  const tMsg = useTranslations("Msg");
  const f = useMsgFormat();
  // OD-18: edits stay a local draft; one explicit Save writes them (a new version in live).
  const [summary, setSummary] = useState(min.summary);
  const [decisions, setDecisions] = useState(min.decisions);
  const [actionItems, setActionItems] = useState(min.actionItems);
  const [decision, setDecision] = useState("");
  const [action, setAction] = useState("");
  const [making, setMaking] = useState<ActionItem | null>(null);
  const fail = (e: unknown) => toast({ title: errorText(tMsg as never, e), tone: "danger" });
  const save = useMessagingMutation((repo, patch: Parameters<typeof repo.minutes.save>[1]) => repo.minutes.save(m.id, patch));
  const makeTask = useMakeTask(m);
  const meId = useMessagingRepository().me.id;
  const people = m.invitees;
  const dirty = min.can.write && (summary !== min.summary || JSON.stringify(decisions) !== JSON.stringify(min.decisions) || JSON.stringify(actionItems) !== JSON.stringify(min.actionItems));
  // Read-only minutes always show the saved state.
  const shownDecisions = min.can.write ? decisions : min.decisions;
  const shownActions = min.can.write ? actionItems : min.actionItems;

  const addDecision = () => {
    if (!decision.trim()) return;
    const me = people.find((p) => p.id === meId) ?? m.organizer;
    setDecisions((list) => [...list, { id: newClientOpId(), text: decision.trim(), proposedBy: me }]);
    setDecision("");
  };
  const addAction = () => {
    if (!action.trim()) return;
    setActionItems((list) => [...list, { id: newClientOpId(), text: action.trim(), assignee: null, due: null, task: null }]);
    setAction("");
  };
  const patchItem = (id: string, patch: Partial<ActionItem>) => setActionItems((list) => list.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const saveDraft = () => save.mutate({ summary, decisions, actionItems }, { onSuccess: () => toast({ title: t("saved") }), onError: fail });

  return (
    <div data-scope={sourceScope(m.source)} className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
      <article aria-labelledby="minutes-title" className="flex min-w-0 flex-col gap-5 rounded-[28px] bg-surface p-5 shadow-island">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MeetingSourceChip source={m.source} />
            <MinutesChip status={min.status} />
            {min.version > 0 ? <span className="text-xs font-bold text-fg-secondary">{t("version", { version: f.number(min.version) })}</span> : null}
          </div>
          <h1 id="minutes-title" className="type-display">
            {t("title")} · <bdi>{m.title}</bdi>
          </h1>
          <p className="text-sm text-fg-secondary">
            {f.date(m.start, "full")} ·{" "}
            <Link href={messagesHref.meeting(m.id)} className="font-bold text-scope-deep hover:underline">
              {t("backToMeeting")}
            </Link>
          </p>
          {min.changesComment && min.status === "draft" ? (
            <p role="status" className="rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning-text">
              {t("changesRequested", { comment: min.changesComment })}
            </p>
          ) : null}
          {min.personal ? <p className="text-xs text-fg-secondary">{t("personalNote")}</p> : null}
        </header>

        <section aria-labelledby="min-summary" className="flex flex-col gap-2">
          <h2 id="min-summary" className="text-sm font-bold">
            {t("summary")}
          </h2>
          {min.can.write ? (
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} dir="auto" aria-label={t("summary")} />
          ) : (
            <p dir="auto" className="whitespace-pre-wrap text-sm">
              {min.summary || t("empty")}
            </p>
          )}
        </section>

        <section aria-labelledby="min-decisions" className="flex flex-col gap-2">
          <h2 id="min-decisions" className="text-sm font-bold">
            {t("decisions")}
          </h2>
          <ul className="flex flex-col gap-2">
            {shownDecisions.map((d: Decision) => (
              <li key={d.id} className="flex items-start gap-3 rounded-2xl bg-subtle p-3 text-sm">
                <Icon icon={Check} size={16} className="mt-0.5 text-scope-deep" />
                <span dir="auto" className="flex-1">
                  {d.text}
                </span>
                {d.proposedBy ? <bdi className="shrink-0 text-xs text-fg-secondary">{t("proposedBy", { name: d.proposedBy.name })}</bdi> : null}
                {min.can.write ? (
                  <button type="button" aria-label={t("removeDecision")} onClick={() => setDecisions((list) => list.filter((x) => x.id !== d.id))}>
                    <Icon icon={Trash2} size={14} />
                  </button>
                ) : null}
              </li>
            ))}
            {shownDecisions.length === 0 ? <li className="text-sm text-fg-secondary">{t("noDecisions")}</li> : null}
          </ul>
          {min.can.write ? (
            <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), addDecision())}>
              <Input value={decision} onChange={(e) => setDecision(e.target.value)} aria-label={t("addDecision")} placeholder={t("addDecision")} className="flex-1" />
              <Button type="submit" size="sm" variant="secondary" disabled={!decision.trim()}>
                <Icon icon={Plus} size={16} />
                {t("add")}
              </Button>
            </form>
          ) : null}
        </section>

        <section aria-labelledby="min-actions" className="flex flex-col gap-2">
          <h2 id="min-actions" className="text-sm font-bold">
            {t("actions")}
          </h2>
          <ul className="flex flex-col gap-2">
            {shownActions.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-subtle p-3 text-sm">
                <Icon icon={ListChecks} size={16} className="text-scope-deep" />
                <span dir="auto" className="min-w-40 flex-1 font-semibold">
                  {a.text}
                </span>
                {min.can.write && !a.task ? (
                  <Select aria-label={t("assignee")} value={a.assignee?.id ?? "none"} onValueChange={(value) => patchItem(a.id, { assignee: value === "none" ? null : (people.find((p) => p.id === value) ?? null) })} className="w-40">
                    <SelectItem value="none">{t("unassigned")}</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </Select>
                ) : (
                  <bdi className="text-xs text-fg-secondary">{a.assignee?.name ?? t("unassigned")}</bdi>
                )}
                {a.due ? <span className="text-xs text-fg-secondary">{t("due", { date: f.date(`${a.due}T12:00:00+03:30`) })}</span> : null}
                {a.task ? (
                  <Link href={a.task.href} className="rounded-pill bg-surface px-3 py-1 text-xs font-bold text-scope-deep hover:underline">
                    {t("openTask")}
                  </Link>
                ) : min.can.makeTask && m.source.kind !== "company" ? (
                  <Button size="sm" variant="secondary" onClick={() => setMaking(a)}>
                    {t("makeTask")}
                  </Button>
                ) : m.source.kind === "company" ? (
                  <span className="text-xs text-fg-secondary">{t("companyNoTasks")}</span>
                ) : null}
              </li>
            ))}
            {shownActions.length === 0 ? <li className="text-sm text-fg-secondary">{t("noActions")}</li> : null}
          </ul>
          {min.can.write ? (
            <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), addAction())}>
              <Input value={action} onChange={(e) => setAction(e.target.value)} aria-label={t("addAction")} placeholder={t("addAction")} className="flex-1" />
              <Button type="submit" size="sm" variant="secondary" disabled={!action.trim()}>
                <Icon icon={Plus} size={16} />
                {t("add")}
              </Button>
            </form>
          ) : null}
        </section>
        {min.can.write ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {dirty ? (
              <span role="status" className="text-xs font-semibold text-fg-secondary">
                {t("unsaved")}
              </span>
            ) : null}
            <Button disabled={!dirty} loading={save.isPending} onClick={saveDraft}>
              {t("save")}
            </Button>
          </div>
        ) : null}
      </article>

      <aside className="flex flex-col gap-4">
        <ReviewPanel meeting={m} minutes={min} unsaved={dirty} />
        <section aria-labelledby="min-versions" className="flex flex-col gap-2 rounded-[22px] bg-surface p-4 shadow-island">
          <h2 id="min-versions" className="text-sm font-bold">
            {t("versions")}
          </h2>
          <ol className="flex flex-col gap-1.5 text-xs">
            {[...min.versions].reverse().map((v, i) => (
              <li key={`${v.version}-${i}`} className="flex flex-col rounded-xl bg-subtle px-3 py-2">
                <span className="font-bold">
                  {t("version", { version: f.number(v.version) })} · {t(`status.${v.status}`)}
                </span>
                <span className="text-fg-secondary">
                  <bdi>{v.by.name}</bdi> · {f.listTime(v.at)}
                  {v.note ? <> · “{v.note}”</> : null}
                </span>
              </li>
            ))}
            {min.versions.length === 0 ? <li className="text-fg-secondary">{t("noVersions")}</li> : null}
          </ol>
        </section>
      </aside>

      {making ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setMaking(null)}
          title={t("makeTaskTitle")}
          description={t("makeTaskDescription", { workspace: m.source.kind === "personal" ? tMsg("meetings.personal") : m.source.name, assignee: making.assignee?.name ?? t("unassigned") })}
          confirmLabel={t("makeTask")}
          onConfirm={async () => {
            try {
              await makeTask(making);
              toast({ title: t("taskCreated") });
              setMaking(null);
            } catch (e) {
              fail(e);
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ReviewPanel({ meeting: m, minutes: min, unsaved }: { meeting: MeetingDetail; minutes: Minutes; unsaved: boolean }) {
  const t = useTranslations("Msg.minutes");
  const tMsg = useTranslations("Msg");
  const meId = useMessagingRepository().me.id;
  // OD-17: exactly one reviewer; approving needs a reason.
  const [reviewer, setReviewer] = useState("");
  const [comment, setComment] = useState("");
  const fail = (e: unknown) => toast({ title: errorText(tMsg as never, e), tone: "danger" });
  const submit = useMessagingMutation((repo, ids: string[]) => repo.minutes.submit(m.id, ids));
  const approve = useMessagingMutation((repo, reason: string | undefined) => repo.minutes.approve(m.id, reason));
  const changes = useMessagingMutation((repo, text: string) => repo.minutes.requestChanges(m.id, text));
  const finalize = useMessagingMutation((repo) => repo.minutes.finalize(m.id));
  const withdraw = useMessagingMutation((repo) => repo.minutes.withdraw(m.id));
  const [withdrawing, setWithdrawing] = useState(false);
  const f = useMsgFormat();

  const reviewList = min.reviews.length ? (
    <ul className="flex flex-col gap-1 text-xs">
      {min.reviews.map((r) => (
        <li key={r.reviewer.id} className="flex items-center justify-between gap-2">
          <bdi>{r.reviewer.name}</bdi>
          <span className="font-bold">{t(`review.${r.state}`)}</span>
        </li>
      ))}
    </ul>
  ) : null;

  if (min.can.review)
    return (
      <SignatureCard as="section" aria-labelledby="review-title" action={<SignatureCardAction icon={Check} label={t("approve")} disabled={approve.isPending || !comment.trim()} onClick={() => approve.mutate(comment.trim(), { onSuccess: () => toast({ title: t("approved") }), onError: fail })} />} contentClassName="gap-3">
        <h2 id="review-title" className="type-title">
          {t("reviewTitle")}
        </h2>
        <p className="text-sm text-fg-secondary">{t("reviewHint")}</p>
        {reviewList}
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} aria-label={t("comment")} placeholder={t("comment")} dir="auto" required />
        <Button size="sm" variant="outline" disabled={!comment.trim()} loading={changes.isPending} onClick={() => changes.mutate(comment, { onSuccess: () => toast({ title: t("changesSent") }), onError: fail })}>
          {t("requestChanges")}
        </Button>
      </SignatureCard>
    );

  return (
    <section aria-labelledby="status-title" className="flex flex-col gap-3 rounded-[22px] bg-surface p-4 shadow-island">
      <h2 id="status-title" className="text-sm font-bold">
        {t("workflow")}
      </h2>
      <p className="text-sm">{t(`statusHint.${min.status}`)}</p>
      {reviewList}
      {min.can.submit ? (
        <>
          <p id="choose-reviewer" className="text-xs font-bold">
            {t("chooseReviewer")}
          </p>
          <RadioGroup aria-labelledby="choose-reviewer" value={reviewer} onValueChange={setReviewer} className="gap-1">
            {m.invitees
              .filter((p) => p.id !== meId)
              .map((p) => (
                <RadioGroupItem key={p.id} value={p.id} label={p.name} />
              ))}
          </RadioGroup>
          {unsaved ? <p className="text-xs text-fg-secondary">{t("saveFirst")}</p> : null}
          <Button size="sm" disabled={!reviewer || unsaved} loading={submit.isPending} onClick={() => submit.mutate([reviewer], { onSuccess: () => toast({ title: t("submitted") }), onError: fail })}>
            {t("submit")}
          </Button>
        </>
      ) : null}
      {min.can.finalize ? (
        <Button size="sm" loading={finalize.isPending} onClick={() => finalize.mutate(undefined as never, { onSuccess: () => toast({ title: t("finalized") }), onError: fail })}>
          {t("finalize")}
        </Button>
      ) : null}
      {min.can.withdraw ? (
        <>
          <Button size="sm" variant="outline" onClick={() => setWithdrawing(true)}>
            {t("withdraw")}
          </Button>
          <ConfirmDialog
            open={withdrawing}
            onOpenChange={setWithdrawing}
            title={t("withdrawTitle")}
            description={t("withdrawDescription", { version: f.number(min.version) })}
            confirmLabel={t("withdrawConfirm")}
            onConfirm={async () => {
              // One attempt on the version shown; a conflict (finalized / changed meanwhile) is reported, never forced.
              try {
                await withdraw.mutateAsync(undefined as never);
                toast({ title: t("withdrawn") });
                setWithdrawing(false);
              } catch (e) {
                fail(e);
                setWithdrawing(false);
              }
            }}
          />
        </>
      ) : null}
    </section>
  );
}

/** Explicit "Make task": the source workspace's own task engine creates it (normal assignment); minutes only link it. */
function useMakeTask(m: MeetingDetail) {
  const repos = useRepositories();
  const messaging = useMessagingRepository();
  const client = useQueryClient();
  return async (item: ActionItem) => {
    const source = m.source;
    const id = source.workspaceId;
    let task: { id: string; href: string };
    if (source.kind === "personal") {
      const created = await repos.tasks.create({ title: item.text, deadline: item.due });
      task = { id: created.id, href: `/personal/tasks/${encodeURIComponent(created.id)}` };
    } else if (source.kind === "project" && id) {
      const phases = await repos.milestones.listPhases(id);
      const phaseId = phases[0]?.id;
      if (!phaseId) throw new Error("no-phase");
      const created = await repos.projectTasks.create(id, { title: item.text, phaseId, assigneeId: item.assignee?.id, due: item.due ?? undefined });
      task = { id: created.id, href: `${projectHref(id, "tasks")}/${encodeURIComponent(created.id)}` };
    } else if (source.kind === "team" && id) {
      const created = await repos.teamTasks.create(id, { title: item.text, assigneeId: item.assignee?.id, due: item.due ?? undefined, planned: false });
      task = { id: created.id, href: `${teamHref(id, "work")}/${encodeURIComponent(created.id)}` };
    } else {
      throw new Error("unsupported");
    }
    await messaging.minutes.linkTask(m.id, item.id, { ...task, workspace: source });
    await client.invalidateQueries();
  };
}
