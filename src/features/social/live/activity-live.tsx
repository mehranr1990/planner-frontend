"use client";

import { Award, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, SelectItem } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { ActivityDetail, Challenge, ClaimAction, EvidenceKind, FinancePostingPreview, Loan, LoanAction, LostFoundPost, NewPollInput, Settlement, SharedExpense } from "@/data/social-domain";
import { useClaims, useFinanceAccounts, useGoalEntries, useGoalsFor, useInvitable, useLoanEvidence, useSocialMutation, useSocialPurgeMutation } from "@/data/social-queries";
import { messagesHref } from "@/features/messages/paths";
import { useSocialFormat } from "../format";
import { newClientOpId, useSocialErrorText } from "../use-social";

/*
 * Live-only activity / ledger / lending / goal flows (Phase 6 server):
 * organiser tools (lifecycle, delete / restore, succession, reminders,
 * invitations, conversation open / join, polls), Finance posting preview →
 * explicit confirm, settlement cancel, loan and claim actions exactly from
 * `allowedActions`, text evidence, goal review and corrections. Rendered only
 * when the server sent the matching state (`activity.server`, `loan.allowedActions`, …).
 */

const useToastError = () => {
  const errorText = useSocialErrorText();
  return (e: unknown) => toast({ title: errorText(e), tone: "danger" });
};

// ── Activity organiser / participant tools ───────────────────────────────

const REMINDERS = [null, 15, 60, 1440] as const;

export function ActivityLivePanel({ activity }: { activity: ActivityDetail }) {
  const t = useTranslations("Social.live.activity");
  const format = useSocialFormat();
  const router = useRouter();
  const onError = useToastError();
  const s = activity.server;
  const [invitee, setInvitee] = useState("");
  const [nominee, setNominee] = useState("");
  const invitable = useInvitable(activity.id, !!s?.manage && s.state === "planned");
  const run = useSocialMutation((repo, step: (r: typeof repo) => Promise<unknown>) => step(repo).then(() => undefined));
  const leaveRun = useSocialPurgeMutation((repo) => repo.activityAdmin.leave(activity.id));
  // The server deadline (`recoverUntil`), compared once per mount: after it, no Restore (RECOVERY_EXPIRED).
  const [openedAt] = useState(Date.now);
  if (!s) return null;
  const go = (step: Parameters<typeof run.mutate>[0], done?: string) => run.mutate(step, { onSuccess: () => (done ? toast({ title: done }) : undefined), onError });
  const planned = s.state === "planned";
  const candidates = activity.attendees.filter((a) => !a.organiser && a.rsvp !== "pending" && a.person.id !== "me");
  return (
    <section aria-labelledby="activity-live" className="flex flex-col gap-3 rounded-row bg-subtle p-4">
      <h2 id="activity-live" className="text-sm font-bold text-fg">{t("title")}</h2>
      {s.state !== "planned" ? <InlineAlert tone={s.state === "deleted" ? "warning" : "info"} title={t(`state.${s.state}`)} /> : null}
      {s.orphaned ? <InlineAlert tone="info" title={t("orphaned")} /> : null}
      {s.state === "deleted" && s.recoverUntil ? (
        <div className="flex flex-wrap items-center gap-2">
          {Date.parse(s.recoverUntil) > openedAt ? <span className="text-sm text-fg-secondary">{t("recoverUntil", { when: format.relative(s.recoverUntil) })}</span> : null}
          {Date.parse(s.recoverUntil) <= openedAt ? (
            <span className="text-sm text-fg-secondary">{t("recoverExpired", { when: format.relative(s.recoverUntil) })}</span>
          ) : s.manage ? (
            <Button size="sm" onClick={() => go((r) => r.activityAdmin.restore(activity.id), t("restored"))}>{t("restore")}</Button>
          ) : null}
        </div>
      ) : null}

      {s.successor ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1">{s.successorIsMe ? t("succession.toMe") : t("succession.pending", { name: s.successor.name || "—" })}</span>
          {s.successorIsMe ? (
            <>
              <Button size="sm" onClick={() => go((r) => r.activityAdmin.respondSuccession(activity.id, "accept"))}>{t("succession.accept")}</Button>
              <Button size="sm" variant="secondary" onClick={() => go((r) => r.activityAdmin.respondSuccession(activity.id, "decline"))}>{t("succession.decline")}</Button>
            </>
          ) : s.manage ? (
            <Button size="sm" variant="ghost" onClick={() => go((r) => r.activityAdmin.respondSuccession(activity.id, "cancel"))}>{t("succession.cancel")}</Button>
          ) : null}
        </div>
      ) : null}

      {s.myRole && planned ? (
        <Field>
          <FieldLabel>{t("reminder")}</FieldLabel>
          <Select value={String(s.reminderMinutes ?? "none")} onValueChange={(v) => go((r) => r.activityAdmin.setReminder(activity.id, v === "none" ? null : Number(v)), t("reminderSaved"))}>
            {REMINDERS.map((m) => (
              <SelectItem key={String(m)} value={m === null ? "none" : String(m)}>{m === null ? t("reminderNone") : t("reminderBefore", { minutes: m })}</SelectItem>
            ))}
          </Select>
        </Field>
      ) : null}

      {s.manage && planned ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field className="min-w-48 flex-1">
            <FieldLabel>{t("invite")}</FieldLabel>
            <Select value={invitee} onValueChange={setInvitee} placeholder={t("invitePick")}>
              {(invitable.data ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name || "—"}</SelectItem>)}
            </Select>
          </Field>
          <Button variant="secondary" disabled={!invitee || run.isPending} onClick={() => go((r) => r.activityAdmin.invite(activity.id, invitee).then(() => setInvitee("")), t("invited"))}>{t("inviteSend")}</Button>
        </div>
      ) : null}

      {s.manage && planned && candidates.length > 0 && !s.successor ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field className="min-w-48 flex-1">
            <FieldLabel>{t("succession.nominate")}</FieldLabel>
            <Select value={nominee} onValueChange={setNominee} placeholder={t("succession.pick")}>
              {candidates.map((a) => <SelectItem key={a.person.id} value={a.person.id}>{a.person.name || "—"}</SelectItem>)}
            </Select>
            <FieldDescription>{t("succession.note")}</FieldDescription>
          </Field>
          <Button variant="secondary" disabled={!nominee} onClick={() => go((r) => r.activityAdmin.nominate(activity.id, nominee), t("succession.sent"))}>{t("succession.send")}</Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {s.conversation.managed && s.myRole ? (
          <Button size="sm" variant="secondary" disabled={run.isPending} onClick={() => run.mutate((r) => r.activityAdmin.joinConversation(activity.id).then((id) => router.push(messagesHref.conversation(id))), { onError })}>{t("chatJoin")}</Button>
        ) : s.manage && planned && s.myRole === "organiser" ? (
          <Button size="sm" variant="secondary" disabled={run.isPending} onClick={() => go((r) => r.activityAdmin.openConversation(activity.id), t("chatOpened"))}>{t("chatOpen")}</Button>
        ) : null}
        {s.manage && planned ? <Button size="sm" variant="secondary" onClick={() => go((r) => r.activityAdmin.close(activity.id), t("closed"))}>{t("close")}</Button> : null}
        {s.manage && s.state !== "deleted" ? <Button size="sm" variant="ghost" className="text-danger-text" onClick={() => go((r) => r.activityAdmin.remove(activity.id), t("deleted"))}>{t("delete")}</Button> : null}
        {s.myRole === "participant" ? <Button size="sm" variant="ghost" onClick={() => leaveRun.mutate(undefined, { onSuccess: () => router.replace("/social/activities"), onError })}>{t("leave")}</Button> : null}
      </div>
      {s.manage && planned ? <NewPollForm activityId={activity.id} /> : null}
    </section>
  );
}

function NewPollForm({ activityId }: { activityId: string }) {
  const t = useTranslations("Social.live.poll");
  const onError = useToastError();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<NewPollInput["kind"]>("general");
  const [question, setQuestion] = useState("");
  const [multiple, setMultiple] = useState(false);
  const [options, setOptions] = useState([{ label: "", day: "", startTime: "" }, { label: "", day: "", startTime: "" }]);
  const create = useSocialMutation((repo, input: NewPollInput) => repo.activityAdmin.createPoll(activityId, input));
  if (!open) return <Button size="sm" variant="ghost" className="self-start" onClick={() => setOpen(true)}><Icon icon={Plus} size={14} />{t("new")}</Button>;
  const valid = question.trim() && options.filter((o) => o.label.trim() && (kind === "general" || o.day)).length >= 2;
  return (
    <form
      className="flex flex-col gap-3 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { kind, question, multiple: kind === "general" && multiple, options: options.filter((o) => o.label.trim()).map((o) => ({ label: o.label, ...(kind === "schedule" ? { day: o.day, startTime: o.startTime || "00:00" } : {}) })) },
          { onSuccess: () => (setOpen(false), toast({ title: t("created") })), onError },
        );
      }}
    >
      <Select value={kind} onValueChange={(v) => setKind(v as NewPollInput["kind"])}>
        <SelectItem value="general">{t("general")}</SelectItem>
        <SelectItem value="schedule">{t("schedule")}</SelectItem>
      </Select>
      <Field><FieldLabel>{t("question")}</FieldLabel><Input dir="auto" value={question} onChange={(e) => setQuestion(e.target.value)} /></Field>
      {options.map((o, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <Input dir="auto" aria-label={t("option", { n: i + 1 })} placeholder={t("option", { n: i + 1 })} value={o.label} className="min-w-40 flex-1" onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
          {kind === "schedule" ? (
            <>
              <Input type="date" aria-label={t("day")} value={o.day} className="w-40" onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, day: e.target.value } : x)))} />
              <Input type="time" aria-label={t("time")} value={o.startTime} className="w-28" onChange={(e) => setOptions((all) => all.map((x, j) => (j === i ? { ...x, startTime: e.target.value } : x)))} />
            </>
          ) : null}
        </div>
      ))}
      <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setOptions((all) => [...all, { label: "", day: "", startTime: "" }])}>{t("addOption")}</Button>
      {kind === "general" ? <Checkbox checked={multiple} onCheckedChange={(v) => setMultiple(v === true)} label={t("multiple")} /> : <p className="text-xs text-fg-muted">{t("scheduleNote")}</p>}
      <p className="text-xs text-fg-muted">{t("anonymous")}</p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || create.isPending}>{t("create")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
      </div>
    </form>
  );
}

// ── Finance posting (own share; preview → explicit confirm) ──────────────

export function FinancePosting({ expense }: { expense: SharedExpense }) {
  const t = useTranslations("Social.live.finance");
  const errorText = useSocialErrorText();
  const [open, setOpen] = useState(false);
  const accounts = useFinanceAccounts(open);
  const [accountId, setAccountId] = useState("");
  const [preview, setPreview] = useState<FinancePostingPreview | null>(null);
  const previewRun = useSocialMutation((repo, id: string) => repo.finance.preview(expense.id, id));
  const post = useSocialMutation((repo, p: FinancePostingPreview) => repo.finance.post(expense.id, p.accountId, p.revisionId));
  if (expense.status !== "approved" && expense.status !== "edit-pending") return null;
  if (expense.myShare === 0) return null;
  if (!open) return <Button size="sm" variant="secondary" className="self-start" onClick={() => setOpen(true)}>{t("open")}</Button>;
  return (
    <section className="flex flex-col gap-3 rounded-row bg-subtle p-4" aria-labelledby="finance-posting">
      <h3 id="finance-posting" className="text-sm font-bold text-fg">{t("title")}</h3>
      <p className="text-xs text-fg-secondary">{t("note")}</p>
      {accounts.isError ? <InlineAlert tone="danger" title={errorText(accounts.error)} /> : null}
      <div className="flex flex-wrap items-end gap-2">
        <Field className="min-w-48 flex-1">
          <FieldLabel>{t("account")}</FieldLabel>
          <Select value={accountId} onValueChange={(v) => (setAccountId(v), setPreview(null))} placeholder={t("account")}>
            {(accounts.data ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{`${a.name} · ${a.currency}`}</SelectItem>)}
          </Select>
        </Field>
        <Button variant="secondary" disabled={!accountId || previewRun.isPending} onClick={() => previewRun.mutate(accountId, { onSuccess: setPreview })}>{t("preview")}</Button>
      </div>
      {previewRun.isError ? <InlineAlert tone="danger" title={errorText(previewRun.error)} /> : null}
      {preview ? (
        <div className="flex flex-col gap-2 rounded-row bg-surface p-3 text-sm">
          <p>{t("summary", { amount: preview.amount, currency: preview.currency, account: preview.accountName, day: preview.localDate })}</p>
          {preview.alreadyPosted ? <InlineAlert tone="info" title={t("already")} /> : null}
          {post.isError ? <InlineAlert tone="danger" title={errorText(post.error)} /> : null}
          {!preview.alreadyPosted ? (
            <Button
              className="self-start"
              disabled={post.isPending}
              onClick={() =>
                post.mutate(preview, {
                  onSuccess: (r) => {
                    toast({ title: r.created ? t("posted") : t("already"), tone: "success" });
                    setPreview(null);
                    setOpen(false);
                  },
                  // EXPENSE_CHANGED_REVIEW: the approved version changed — preview again.
                  onError: () => setPreview(null),
                })
              }
            >
              {t("confirm")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SettlementCancel({ settlement }: { settlement: Settlement }) {
  const t = useTranslations("Social.live");
  const onError = useToastError();
  const cancel = useSocialMutation((repo) => repo.settlements.cancel(settlement.id));
  if (settlement.recordedBy.id !== "me" || settlement.status === "confirmed") return null;
  return <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate(undefined, { onError })}>{t("settlementCancel")}</Button>;
}

// ── Loans & claims: exactly the server's allowedActions ──────────────────

const NOTE_ACTIONS: LoanAction[] = ["dispute", "report-lost", "report-damaged", "reject"];
const EVIDENCE_KINDS: EvidenceKind[] = ["CONDITION", "HANDOVER", "RETURN", "DAMAGE", "LOSS", "IDENTIFYING", "OTHER"];

export function LoanLiveActions({ loan }: { loan: Loan }) {
  const t = useTranslations("Social.live.loan");
  const format = useSocialFormat();
  const onError = useToastError();
  const [note, setNote] = useState("");
  const [due, setDue] = useState("");
  const [showEvidence, setShowEvidence] = useState(false);
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<EvidenceKind>("CONDITION");
  const evidence = useLoanEvidence(loan.id, showEvidence);
  const act = useSocialMutation((repo, action: LoanAction) => repo.lendingServer.act(loan.id, action, note));
  const proposeDue = useSocialMutation((repo) => repo.lendingServer.proposeDue(loan.id, due, note));
  const addEvidence = useSocialMutation((repo) => repo.lendingServer.addLoanEvidence(loan.id, { kind, label, note: "" }));
  if (!loan.allowedActions) return null;
  const closed = ["RETURNED", "REJECTED", "CANCELED", "LOST", "DAMAGED"].includes(loan.serverState ?? "");
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      {loan.moderator ? <p className="text-xs text-fg-muted">{t("moderator")}</p> : null}
      {loan.proposedDue ? <p className="text-xs text-fg-secondary">{t("dueProposed", { day: format.day(loan.proposedDue) })}</p> : null}
      {loan.allowedActions.some((a) => NOTE_ACTIONS.includes(a)) ? <Input dir="auto" aria-label={t("note")} placeholder={t("note")} value={note} onChange={(e) => setNote(e.target.value)} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {loan.allowedActions.map((a) => (
          <Button key={a} size="sm" variant={a === "accept" || a === "receive" || a === "confirm-return" ? "primary" : "secondary"} disabled={act.isPending || (a === "dispute" && !note.trim())} onClick={() => act.mutate(a, { onSuccess: () => setNote(""), onError })}>
            {t(`action.${a}`)}
          </Button>
        ))}
      </div>
      {!closed && !loan.moderator ? (
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" aria-label={t("newDue")} value={due} onChange={(e) => setDue(e.target.value)} className="w-40" />
          <Button size="sm" variant="ghost" disabled={!due || proposeDue.isPending} onClick={() => proposeDue.mutate(undefined, { onSuccess: () => (setDue(""), toast({ title: t("dueSent") })), onError })}>{t("proposeDue")}</Button>
        </div>
      ) : null}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => setShowEvidence((v) => !v)}>{t("evidence")}</Button>
      {showEvidence ? (
        <div className="flex flex-col gap-2 rounded-row bg-surface p-2">
          {(evidence.data ?? []).map((e) => (
            <p key={e.id} className="text-xs"><bdi>{e.label}</bdi> · {t(`evidenceKind.${e.kind}`)} · {format.relative(e.at)}</p>
          ))}
          {!loan.moderator && !closed ? (
            <div className="flex flex-wrap gap-2">
              <Select value={kind} onValueChange={(v) => setKind(v as EvidenceKind)}>
                {EVIDENCE_KINDS.map((k) => <SelectItem key={k} value={k}>{t(`evidenceKind.${k}`)}</SelectItem>)}
              </Select>
              <Input dir="auto" aria-label={t("evidenceLabel")} placeholder={t("evidenceLabel")} value={label} onChange={(e) => setLabel(e.target.value)} className="min-w-40 flex-1" />
              <Button size="sm" variant="secondary" disabled={!label.trim() || addEvidence.isPending} onClick={() => addEvidence.mutate(undefined, { onSuccess: () => setLabel(""), onError })}>{t("evidenceAdd")}</Button>
            </div>
          ) : null}
          <p className="text-xs text-fg-muted">{t("evidenceNote")}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ClaimPanel({ post }: { post: LostFoundPost }) {
  const t = useTranslations("Social.live.claim");
  const onError = useToastError();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const claims = useClaims(post.id, open && (post.mine || !!post.myClaimId));
  const claim = useSocialMutation((repo) => repo.lostFound.claim(post.id, note));
  const act = useSocialMutation((repo, input: { claimId: string; action: ClaimAction }) => repo.lendingServer.claimAct(post.id, input.claimId, input.action, ""));
  const postAct = useSocialMutation((repo, action: "withdraw" | "hide") => repo.lendingServer.postAct(post.id, action));
  if (post.serverState === undefined) return null;
  const isOpen = post.serverState === "open";
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      {post.contested ? <span className="self-start rounded-pill bg-warning-soft px-2 text-xs font-semibold text-warning-text">{t("contested")}</span> : null}
      {!post.mine && !post.myClaimId && isOpen ? (
        <div className="flex flex-wrap gap-2">
          <Textarea dir="auto" aria-label={t("note")} placeholder={t("note")} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-16 min-w-48 flex-1" />
          <Button size="sm" disabled={!note.trim() || claim.isPending} onClick={() => claim.mutate(undefined, { onSuccess: () => (setNote(""), toast({ title: t("sent") })), onError })}>{t("send")}</Button>
        </div>
      ) : null}
      {post.mine || post.myClaimId ? (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => setOpen((v) => !v)}>{t("claims", { n: post.openClaims ?? 0 })}</Button>
      ) : null}
      {open
        ? (claims.data ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-1.5 rounded-row bg-surface p-2 text-xs">
              <bdi className="min-w-0 flex-1">{c.note}</bdi>
              <span className="text-fg-muted">{t(`state.${c.state}`)}</span>
              {c.allowedActions.map((a) => (
                <Button key={a} size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ claimId: c.id, action: a }, { onError })}>{t(`action.${a}`)}</Button>
              ))}
            </div>
          ))
        : null}
      {post.mine && isOpen ? (
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => postAct.mutate("withdraw", { onError })}>{t("withdraw")}</Button>
        </div>
      ) : null}
      <p className="text-xs text-fg-muted">{t("noProof")}</p>
    </div>
  );
}

// ── Goals & challenges ───────────────────────────────────────────────────

export function GoalLivePanel({ challenge }: { challenge: Challenge }) {
  const t = useTranslations("Social.live.goal");
  const format = useSocialFormat();
  const onError = useToastError();
  const s = challenge.server;
  const [reviewing, setReviewing] = useState(false);
  const entries = useGoalEntries(challenge.id, reviewing);
  const review = useSocialMutation((repo, input: { entryId: string; action: "approve" | "reject" | "retract" }) => repo.goals.review(challenge.id, input.entryId, input.action, ""));
  const end = useSocialMutation((repo, action: "close" | "cancel") => repo.goals.end(challenge.id, action));
  if (!s) return null;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2 text-sm">
      <p className="text-xs text-fg-secondary">{t(`kind.${s.kind}`)} · {t(`window.${s.window}`)} · {t("percent", { n: format.number(s.percent) })}</p>
      {s.badgeAt ? (
        <p className="flex items-center gap-1.5 text-xs font-semibold text-scope-deep"><Icon icon={Award} size={14} />{t("badge")}</p>
      ) : null}
      {s.myPending ? <p className="text-xs text-fg-secondary">{t("pending", { n: format.number(s.myPending) })}</p> : null}
      {s.reviewRequired && !s.independentReviewerAvailable && challenge.joined ? <InlineAlert tone="warning" title={t("noReviewer")} /> : null}
      {s.organizer ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setReviewing((v) => !v)}>{t("review", { n: s.pendingReviewCount ?? 0 })}</Button>
          {s.state === "active" ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => end.mutate("close", { onError })}>{t("close")}</Button>
              <Button size="sm" variant="ghost" onClick={() => end.mutate("cancel", { onError })}>{t("cancel")}</Button>
            </>
          ) : null}
        </div>
      ) : null}
      {reviewing
        ? (entries.data ?? [])
            .filter((e) => e.state === "pending")
            .map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-row bg-surface p-2 text-xs">
                <bdi className="min-w-0 flex-1">{e.person.name || "—"} · {format.number(e.amount)} {challenge.unit}{e.day ? ` · ${format.day(e.day)}` : ""}</bdi>
                {e.canReview ? (
                  <>
                    <Button size="sm" onClick={() => review.mutate({ entryId: e.id, action: "approve" }, { onError })}>{t("approve")}</Button>
                    <Button size="sm" variant="secondary" onClick={() => review.mutate({ entryId: e.id, action: "reject" }, { onError })}>{t("reject")}</Button>
                  </>
                ) : e.mine ? (
                  <Button size="sm" variant="ghost" onClick={() => review.mutate({ entryId: e.id, action: "retract" }, { onError })}>{t("retract")}</Button>
                ) : (
                  <span className="text-fg-muted">{t("ownEntry")}</span>
                )}
              </div>
            ))
        : null}
      <p className="text-xs text-fg-muted">{t("fair")}</p>
    </div>
  );
}

/** /social/activities/[id]/goals — Activity-context Social Goals (same rules as Group ones). */
export function ActivityGoals({ activityId, canCreate }: { activityId: string; canCreate: boolean }) {
  const t = useTranslations("Social.live.goal");
  const format = useSocialFormat();
  const onError = useToastError();
  const goals = useGoalsFor({ activityId });
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [endDay, setEndDay] = useState("");
  const [kind, setKind] = useState<"goal" | "challenge">("challenge");
  const [reviewRequired, setReviewRequired] = useState(false);
  const [amount, setAmount] = useState<Record<string, string>>({});
  const create = useSocialMutation((repo) =>
    repo.goals.create({ kind, context: { activityId }, title, unit, target: Number(target), startDay: new Date().toISOString().slice(0, 10), endDay, reviewRequired, clientOpId: newClientOpId("goal") }),
  );
  const join = useSocialMutation((repo, id: string) => repo.challenges.join(id));
  const leave = useSocialMutation((repo, id: string) => repo.challenges.leave(id));
  const log = useSocialMutation((repo, input: { id: string; amount: number }) => repo.challenges.log(input.id, input.amount, new Date().toISOString().slice(0, 10)));
  const errorText = useSocialErrorText();
  return (
    <section className="flex flex-col gap-4">
      {goals.isError ? <InlineAlert tone="danger" title={errorText(goals.error)} /> : null}
      {goals.data?.length === 0 ? <p className="text-sm text-fg-muted">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-3">
        {(goals.data ?? []).map((g) => (
          <li key={g.id} className="flex flex-col gap-2 rounded-card bg-surface p-4 shadow-card">
            <p className="font-semibold"><bdi>{g.title}</bdi></p>
            <p className="text-xs text-fg-secondary">{t("progress", { total: format.number(g.total), target: format.number(g.target), unit: g.unit, people: format.number(g.participants) })}</p>
            {g.joined ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input inputMode="numeric" aria-label={t("amount")} placeholder={t("amount")} className="w-28" value={amount[g.id] ?? ""} onChange={(e) => setAmount((a) => ({ ...a, [g.id]: e.target.value }))} />
                <Button size="sm" disabled={!/^\d+$/.test(amount[g.id] ?? "")} onClick={() => log.mutate({ id: g.id, amount: Number(amount[g.id]) }, { onSuccess: () => setAmount((a) => ({ ...a, [g.id]: "" })), onError })}>{t("log")}</Button>
                <Button size="sm" variant="ghost" onClick={() => leave.mutate(g.id, { onError })}>{t("withdraw")}</Button>
              </div>
            ) : g.server?.state === "active" ? (
              <Button size="sm" className="self-start" onClick={() => join.mutate(g.id, { onError })}>{t("join")}</Button>
            ) : null}
            <GoalLivePanel challenge={g} />
          </li>
        ))}
      </ul>
      {canCreate ? (
        <form
          className="flex flex-col gap-3 rounded-row bg-subtle p-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate(undefined, { onSuccess: () => (setTitle(""), setUnit(""), setTarget(""), setEndDay("")), onError });
          }}
        >
          <h2 className="text-sm font-bold">{t("new")}</h2>
          <Select value={kind} onValueChange={(v) => setKind(v as "goal" | "challenge")}>
            <SelectItem value="challenge">{t("kind.challenge")}</SelectItem>
            <SelectItem value="goal">{t("kind.goal")}</SelectItem>
          </Select>
          <Input dir="auto" aria-label={t("titleField")} placeholder={t("titleField")} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Input dir="auto" aria-label={t("unit")} placeholder={t("unit")} value={unit} onChange={(e) => setUnit(e.target.value)} className="w-32" />
            <Input inputMode="numeric" aria-label={t("target")} placeholder={t("target")} value={target} onChange={(e) => setTarget(e.target.value)} className="w-28" />
            <Input type="date" aria-label={t("endDay")} value={endDay} onChange={(e) => setEndDay(e.target.value)} className="w-40" />
          </div>
          <Checkbox checked={reviewRequired} onCheckedChange={(v) => setReviewRequired(v === true)} label={t("reviewRequired")} />
          <Button type="submit" size="sm" className="self-start" disabled={!title.trim() || !unit.trim() || !/^\d+$/.test(target) || !endDay || create.isPending}>{t("create")}</Button>
        </form>
      ) : null}
    </section>
  );
}
