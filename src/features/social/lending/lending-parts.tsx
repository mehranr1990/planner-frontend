"use client";

import { Check, CircleCheck, Circle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { IssueKind, Loan, LostFoundPost, Thing } from "@/data/social-domain";
import { useSocialMutation } from "@/data/social-queries";
import { DayField } from "@/features/goals/goal-sheet";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { GlyphTile } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * Lending pieces shared by SO-10 (group) and SO-18 (my things): loan state,
 * the loan card (signature card when a confirmation is due for the viewer —
 * notch = Accept / Confirm handover / Confirm return; plain product card
 * otherwise), the two-sided timeline with timestamps, problems (lost /
 * damaged / disputed, resolved by both sides, no fines), the request dialog
 * and lost & found rows (claim, mutual confirmation). Never an address.
 */

export function useLoanState() {
  const t = useTranslations("Social.lending.state");
  return (loan: Loan) => {
    if (loan.overdue) return { label: t("overdue"), tone: "bg-danger-soft text-danger-text" };
    if (loan.status === "requested") return { label: t("requested"), tone: "bg-warning-soft text-warning-text" };
    if (loan.status === "returned") return { label: t("returned"), tone: "bg-subtle text-fg-secondary" };
    if (loan.status === "declined") return { label: t("declined"), tone: "bg-subtle text-fg-secondary" };
    return { label: t("lentOut"), tone: "bg-scope-soft text-scope-deep" };
  };
}

export function LoanRow({ loan, selected, onSelect }: { loan: Loan; selected?: boolean; onSelect?: () => void }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const state = useLoanState()(loan);
  const content = (
    <>
      <GlyphTile kind={loan.thing.category} />
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate text-sm font-bold text-fg">{loan.thing.name}</bdi>
        <span className="truncate text-xs text-fg-secondary">
          <bdi>{loan.lender.id === "me" ? t("common.you") : loan.lender.name}</bdi> → <bdi>{loan.borrower.id === "me" ? t("common.you") : loan.borrower.name}</bdi> · {t("lending.dueOn", { date: format.day(loan.due) })}
        </span>
      </span>
      {loan.myStep ? <span className="size-2 shrink-0 rounded-full bg-scope-deep" aria-hidden="true" /> : null}
      <span className={cn("shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-bold", state.tone)}>{state.label}</span>
    </>
  );
  return (
    <li>
      {onSelect ? (
        <button type="button" aria-pressed={selected} onClick={onSelect} className={cn("flex min-h-16 w-full items-center gap-3 rounded-row px-3 py-2 text-start transition-colors", selected ? "bg-scope-soft" : "bg-subtle hover:bg-raised")}>
          {content}
        </button>
      ) : (
        <div className="flex min-h-16 items-center gap-3 rounded-row bg-subtle px-3 py-2">{content}</div>
      )}
    </li>
  );
}

export function LoanCard({ loan }: { loan: Loan }) {
  const t = useTranslations("Social.lending");
  const tCommon = useTranslations("Social.common");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const [reporting, setReporting] = useState(false);
  const step = useSocialMutation((repo) => repo.lending.step(loan.id));
  const accept = useSocialMutation((repo, yes: boolean) => repo.lending.accept(loan.id, yes));
  const resolve = useSocialMutation((repo, issueId: string) => repo.lending.resolveIssue(loan.id, issueId));
  const other = loan.iAmLender ? loan.borrower : loan.lender;
  const state = useLoanState()(loan);
  const when = (iso: string | null) => (iso ? format.relative(iso) : null);
  const timeline = [
    { label: t("timeline.handoverRecorded"), at: loan.handover.recordedAt },
    { label: t("timeline.handoverConfirmed"), at: loan.handover.confirmedAt },
    { label: t("timeline.returnRecorded"), at: loan.return.recordedAt },
    { label: t("timeline.returnConfirmed"), at: loan.return.confirmedAt },
  ];
  const run = () =>
    loan.myStep === "accept"
      ? accept.mutate(true, { onError: (e) => toast({ title: errorText(e), tone: "danger" }) })
      : step.mutate(undefined, { onSuccess: () => toast({ title: t("stepped"), tone: "success" }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) });
  const body = (
    <>
      <p className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">{t("loanCard")} · {state.label}</p>
      <h2 id={`loan-${loan.id}`} className="pe-16 type-h2 text-fg">
        <bdi>{loan.thing.name}</bdi>
      </h2>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-xs text-fg-muted">{t("lender")}</dt>
          <dd className="font-semibold"><bdi>{loan.lender.id === "me" ? tCommon("you") : loan.lender.name}</bdi></dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("borrower")}</dt>
          <dd className="font-semibold"><bdi>{loan.borrower.id === "me" ? tCommon("you") : loan.borrower.name}</bdi></dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("from")} – {t("due")}</dt>
          <dd className="font-semibold">{format.range(loan.from, loan.due)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("place")}</dt>
          <dd className="font-semibold"><bdi>{loan.place || "—"}</bdi></dd>
        </div>
      </dl>
      {loan.myStep ? (
        <p className="rounded-row bg-scope-soft p-3 text-sm text-scope-deep">
          {t(`stepHint.${loan.myStep}`, { name: other.name, from: format.day(loan.from), due: format.day(loan.due) })}
        </p>
      ) : null}
      {loan.myStep === "accept" ? (
        <Button size="sm" variant="ghost" className="self-start" onClick={() => accept.mutate(false)}>
          {t("decline")}
        </Button>
      ) : null}
      <ol className="flex flex-col gap-1.5" aria-label={t("loanCard")}>
        {timeline.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <Icon icon={s.at ? CircleCheck : Circle} size={16} className={s.at ? "text-success-text" : "text-fg-muted"} />
            <span className={cn("flex-1", s.at ? "text-fg" : "text-fg-muted")}>{s.label}</span>
            <span className="text-xs text-fg-muted">{when(s.at)}</span>
          </li>
        ))}
      </ol>
      {loan.issues.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {loan.issues.map((issue) => {
            const done = issue.resolvedByLender && issue.resolvedByBorrower;
            const mineDone = loan.iAmLender ? issue.resolvedByLender : issue.resolvedByBorrower;
            return (
              <li key={issue.id} className="flex flex-col gap-1 rounded-row bg-warning-soft p-3 text-warning-text">
                <span className="text-sm font-bold">{t(`issueKinds.${issue.kind}`)} · <bdi>{issue.by.name}</bdi></span>
                <bdi className="text-xs">{issue.note}</bdi>
                <span className="text-xs font-semibold">{done ? t("resolvedBoth") : mineDone ? t("resolveWaiting") : null}</span>
                {!done && !mineDone ? (
                  <Button size="sm" variant="secondary" className="self-start" onClick={() => resolve.mutate(issue.id)}>
                    {t("resolve")}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {loan.status === "out" || loan.status === "accepted" ? (
        <Button size="sm" variant="ghost" className="self-start" aria-haspopup="dialog" onClick={() => setReporting(true)}>
          {t("issue")}
        </Button>
      ) : null}
      <p className="text-xs text-fg-muted">{t("noFines")}</p>
      {reporting ? <IssueDialog loanId={loan.id} onClose={() => setReporting(false)} /> : null}
    </>
  );
  if (!loan.myStep) {
    return (
      <ProductCard as="section" aria-labelledby={`loan-${loan.id}`} className="flex flex-col gap-3">
        {body}
      </ProductCard>
    );
  }
  return (
    <SignatureCard as="section" aria-labelledby={`loan-${loan.id}`} contentClassName="flex flex-col gap-3" action={<SignatureCardAction label={t(`step.${loan.myStep}`)} icon={Check} disabled={step.isPending || accept.isPending} onClick={run} />}>
      {body}
    </SignatureCard>
  );
}

function IssueDialog({ loanId, onClose }: { loanId: string; onClose: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [kind, setKind] = useState<IssueKind>("damaged");
  const [note, setNote] = useState("");
  const report = useSocialMutation((repo) => repo.lending.reportIssue(loanId, kind, note));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("lending.issue")} description={t("lending.noFines")}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!note.trim()) return;
            report.mutate(undefined, { onSuccess: () => { toast({ title: t("lending.issueSent") }); onClose(); } });
          }}
        >
          <RadioGroup value={kind} onValueChange={(value) => setKind(value as IssueKind)} aria-label={t("lending.issue")}>
            {(["lost", "damaged", "disputed"] as const).map((k) => (
              <RadioGroupItem key={k} value={k} label={t(`lending.issueKinds.${k}`)} />
            ))}
          </RadioGroup>
          <Field>
            <FieldLabel>{t("lending.issueNote")}</FieldLabel>
            <Textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          {report.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(report.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!note.trim() || report.isPending}>{t("lending.issue")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RequestDialog({ thing, onClose }: { thing: Thing; onClose: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [from, setFrom] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [place, setPlace] = useState("");
  const request = useSocialMutation((repo) => repo.lending.request(thing.id, from!, due!, place));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("lending.requestTitle", { thing: thing.name })}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!from || !due || due < from) return;
            request.mutate(undefined, { onSuccess: () => { toast({ title: t("lending.requestSent", { name: thing.keeper.name }), tone: "success" }); onClose(); } });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DayField label={t("lending.from")} emptyLabel={t("lending.from")} value={from} onChange={setFrom} />
            <DayField label={t("lending.due")} emptyLabel={t("lending.due")} value={due} onChange={setDue} />
          </div>
          <Field>
            <FieldLabel>{t("lending.place")}</FieldLabel>
            <Input dir="auto" value={place} onChange={(event) => setPlace(event.target.value)} />
            <FieldDescription>{t("lending.placeHint")}</FieldDescription>
          </Field>
          {request.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(request.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!from || !due || due < from || request.isPending}>{t("lending.request")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LostFoundList({ posts, showGroup = false }: { posts: readonly LostFoundPost[]; showGroup?: boolean }) {
  const t = useTranslations("Social");
  const format = useSocialFormat();
  const claim = useSocialMutation((repo, id: string) => repo.lostFound.claim(id));
  const confirm = useSocialMutation((repo, id: string) => repo.lostFound.confirm(id));
  if (posts.length === 0) return <p className="p-2 text-sm text-fg-secondary">{t("lending.lostFound.noPosts")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {posts.map((p) => {
        const claimText = p.kind === "missing" ? t("lending.lostFound.haveIt") : t("lending.lostFound.mine");
        const iClaimed = p.claim?.by.id === "me";
        const myConfirmPending = (p.mine && p.claim && !p.confirmedByPoster) || (iClaimed && !p.confirmedByClaimer);
        const waitingFor = p.mine ? p.claim?.by.name : p.by.name;
        return (
          <li key={p.id} className="flex flex-col gap-2 rounded-row bg-subtle px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("rounded-pill px-2.5 py-0.5 text-xs font-bold", p.kind === "missing" ? "bg-warning-soft text-warning-text" : "bg-scope-soft text-scope-deep")}>{t(`lending.lostFound.${p.kind}`)}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <bdi className="text-sm font-bold text-fg">{p.title}</bdi>
                <span className="text-xs text-fg-secondary">
                  <bdi>{p.by.id === "me" ? t("common.you") : p.by.name}</bdi> · {format.relative(p.at)}
                  {showGroup ? <> · <bdi>{p.group.name}</bdi></> : null}
                </span>
              </span>
              {p.resolved ? <span className="rounded-pill bg-success-soft px-2.5 py-0.5 text-xs font-bold text-success-text">{t("lending.lostFound.resolved")}</span> : null}
            </div>
            {p.note ? <bdi className="text-xs text-fg-secondary">{p.note}</bdi> : null}
            {p.claim ? <p className="text-xs font-semibold text-fg">{t("lending.lostFound.claimedBy", { name: p.claim.by.name, claim: claimText })}</p> : null}
            {!p.resolved ? (
              <div className="flex flex-wrap items-center gap-2">
                {!p.mine && !p.claim ? (
                  <Button size="sm" variant="secondary" onClick={() => claim.mutate(p.id)}>{claimText}</Button>
                ) : null}
                {myConfirmPending ? (
                  <Button size="sm" onClick={() => confirm.mutate(p.id)}>{t("lending.lostFound.confirm")}</Button>
                ) : p.claim && (p.mine || iClaimed) ? (
                  <span className="text-xs text-fg-muted">{t("lending.lostFound.waiting", { name: waitingFor ?? "" })}</span>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function ThingRow({ thing, action }: { thing: Thing; action?: ReactNode }) {
  const t = useTranslations("Social");
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-row bg-subtle px-3 py-2">
      <GlyphTile kind={thing.category} />
      <span className="flex min-w-0 flex-1 flex-col">
        <bdi className="truncate text-sm font-bold text-fg">{thing.name}</bdi>
        <span className="truncate text-xs text-fg-secondary">
          {thing.group && !thing.owner ? `${t("lending.groupOwned")} · ${t("lending.keeper", { name: thing.keeper.name })}` : t("lending.ownedBy", { name: thing.owner?.id === "me" ? t("common.you") : (thing.owner?.name ?? "") })}
          {thing.condition ? ` · ${thing.condition}` : ""}
        </span>
      </span>
      <span className={cn("shrink-0 rounded-pill px-2.5 py-0.5 text-xs font-bold", thing.activeLoanId ? "bg-scope-soft text-scope-deep" : "bg-success-soft text-success-text")}>
        {thing.activeLoanId ? t("lending.state.lentOut") : t("lending.state.available")}
      </span>
      {action}
    </li>
  );
}

