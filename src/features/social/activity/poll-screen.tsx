"use client";

import { CalendarCheck } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { AccessLoading, AccessState } from "@/components/feedback/access-state";
import { ErrorState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "@/components/ui/toast";
import type { FreeBusyCell, FreeBusyView, Poll, PollOption, Vote } from "@/data/social-domain";
import { useActivity, useFreeBusy, usePoll, useSocialMutation } from "@/data/social-queries";
import { SocialError } from "@/data/social-repositories";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { convertDigits } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { useSocialFormat } from "../format";
import { socialHref } from "../paths";
import { isUnsupported, PersonAvatar, queryGate, SocialPageHeader, SocialUnsupported } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * SO-06 · Poll & free/busy (/social/activities/[id]/poll). Date/time poll:
 * yes / if needed per option, deadline, results after voting (setting);
 * the organiser picks the final date (signature card notch) → activity
 * dates set and RSVPs asked again. Free/busy is consent-based per request:
 * only free/busy blocks (no titles), "not shared" is a hatched cell; the
 * consent prompt offers Not now / Share for this activity. Phones get a
 * simplified list per person.
 */
export function PollScreen() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("Social");
  const activity = useActivity(id);
  if (activity.isError) return isUnsupported(activity.error) ? <SocialUnsupported /> : activity.error instanceof SocialError ? <AccessState kind="social-not-available" /> : <ErrorState onRetry={() => void activity.refetch()} />;
  if (!activity.data) return <AccessLoading />;
  const a = activity.data;
  const header = (
    <SocialPageHeader
      group={a.group && !a.isGuest ? a.group : null}
      trail={[{ label: a.title, href: socialHref.activity(a.id) }, { label: t("poll.title") }]}
      title={t("poll.title")}
      subtitle={<bdi>{a.title}</bdi>}
    />
  );
  if (a.pollIds.length === 0) {
    return (
      <>
        {header}
        <ProductCard>
          <p className="text-sm text-fg-secondary">{t("poll.noPoll")}</p>
        </ProductCard>
      </>
    );
  }
  return (
    <>
      {header}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {a.pollIds.map((pollId) => (
            <PollBlock key={pollId} pollId={pollId} />
          ))}
          <UtilityCard className="flex flex-col gap-1.5">
            <h2 className="text-sm font-bold text-fg">{t("poll.types.title")}</h2>
            <ul className="list-disc ps-5 text-sm text-fg-secondary">
              <li>{t("poll.types.single")}</li>
              <li>{t("poll.types.multiple")}</li>
              <li>{t("poll.types.date")}</li>
            </ul>
            <p className="text-xs text-fg-muted">{t("poll.types.note")}</p>
          </UtilityCard>
        </div>
        <FreeBusyCard activityId={a.id} />
      </div>
    </>
  );
}

function PollBlock({ pollId }: { pollId: string }) {
  const poll = usePoll(pollId);
  const gate = queryGate([poll]);
  if (gate) return gate;
  return <PollCard key={poll.data!.id + String(poll.data!.closed)} poll={poll.data!} />;
}

/*
 * One poll. Date/time: yes / if needed per option, organiser picks the final
 * date (signature card notch). Single choice: exactly one "yes". Multiple
 * choice: any number of "yes". Anonymous polls show counts only; results
 * may be hidden until you vote (setting). The organiser may close any poll.
 */
function PollCard({ poll }: { poll: Poll }) {
  const t = useTranslations("Social.poll");
  const format = useSocialFormat();
  const errorText = useSocialErrorText();
  const [votes, setVotes] = useState<Record<string, Vote>>(poll.myVotes);
  const [picking, setPicking] = useState(false);
  const best = [...poll.options].sort((x, y) => y.yes - x.yes || y.ifNeeded - x.ifNeeded)[0];
  const [finalId, setFinalId] = useState(best?.id ?? "");
  const save = useSocialMutation((repo) => repo.polls.vote(poll.id, votes));
  const pick = useSocialMutation((repo, optionId: string) => repo.polls.pickFinal(poll.id, optionId));
  const label = (o: PollOption) => (o.day ? `${format.day(o.day, "full")}${o.startTime ? ` · ${convertDigits(o.startTime, format.digits)}${o.endTime ? `–${convertDigits(o.endTime, format.digits)}` : ""}` : ""}` : o.label);
  const dirty = JSON.stringify(votes) !== JSON.stringify(poll.myVotes);
  const date = poll.kind === "date";
  const close = useSocialMutation((repo) => repo.polls.close(poll.id));
  const cycle = (optionId: string) =>
    !date
      ? setVotes((current) => {
          const on = current[optionId] === "yes";
          if (poll.kind === "single") return on ? {} : { [optionId]: "yes" };
          const next = { ...current };
          if (on) delete next[optionId];
          else next[optionId] = "yes";
          return next;
        })
      : setVotes((current) => {
      const next = { ...current };
      const value = current[optionId];
      if (value === undefined) next[optionId] = "yes";
      else if (value === "yes") next[optionId] = "if-needed";
      else delete next[optionId];
      return next;
    });

  const body: ReactNode = (
    <>
      <p className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">{poll.closed ? t("closed") : t("deadline", { date: format.relative(poll.deadline) })}</p>
      <h2 id={`poll-q-${poll.id}`} className="pe-16 type-h2 text-fg">
        <bdi>{poll.question}</bdi>
      </h2>
      <p className="text-xs text-fg-secondary">
        {t("respondents", { answered: format.number(poll.respondents), total: format.number(poll.invited) })}
        {poll.anonymous ? ` · ${t("anonymous")}` : ""}
      </p>
      <p className="text-xs font-semibold text-fg-secondary">{t(`kindLabel.${poll.kind}`)}</p>
      {!poll.closed ? <p className="text-sm font-semibold text-fg">{date ? t("pickAll") : poll.kind === "single" ? t("pickOne") : t("pickMany")}</p> : null}
      <ul className="flex flex-col gap-2">
        {poll.options.map((o) => {
          const mine = votes[o.id];
          const final = poll.finalOptionId === o.id;
          return (
            <li key={o.id} className={cn("flex flex-wrap items-center gap-3 rounded-row px-3 py-2.5", final ? "bg-scope-soft" : "bg-subtle")}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-bold text-fg">{label(o)}</span>
                <span className="text-xs text-fg-secondary">
                  {poll.resultsVisible ? (date ? t("votes", { yes: format.number(o.yes), maybe: format.number(o.ifNeeded) }) : t("count", { n: format.number(o.yes) })) : t("hidden")}
                  {best?.id === o.id && poll.resultsVisible && o.yes > 0 && !poll.closed ? ` · ${t("best")}` : ""}
                  {final ? ` · ${t("final")}` : ""}
                </span>
              </span>
              {o.voters.length > 0 ? (
                <span className="flex -space-x-1.5 rtl:space-x-reverse" aria-hidden="true">
                  {o.voters.slice(0, 5).map((v) => (
                    <PersonAvatar key={v.person.id} person={v.person} className={cn(v.vote === "if-needed" && "opacity-60")} />
                  ))}
                </span>
              ) : null}
              {!poll.closed ? (
                <button
                  type="button"
                  role={date ? undefined : poll.kind === "single" ? "radio" : "checkbox"}
                  aria-checked={date ? undefined : mine === "yes"}
                  onClick={() => cycle(o.id)}
                  aria-label={`${label(o)}: ${mine === "yes" ? t("yes") : mine === "if-needed" ? t("ifNeeded") : t("no")}`}
                  className={cn(
                    "inline-flex h-9 min-w-24 items-center justify-center rounded-pill px-3 text-xs font-bold transition-colors",
                    mine === "yes" ? "bg-scope-deep text-on-accent" : mine === "if-needed" ? "bg-scope-soft text-scope-deep" : "text-fg-secondary inset-ring inset-ring-outline",
                  )}
                >
                  {mine === "yes" ? t("yes") : mine === "if-needed" ? t("ifNeeded") : t("no")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {!poll.closed ? (
        <Button
          className="self-start"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate(undefined, { onSuccess: () => toast({ title: t("saved"), tone: "success" }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}
        >
          {t("save")}
        </Button>
      ) : null}
      <ConfirmDialog
        open={picking}
        onOpenChange={setPicking}
        title={t("pickFinal")}
        description={t("pickFinalBody")}
        confirmLabel={t("pickFinal")}
        error={pick.isError ? errorText(pick.error) : undefined}
        onConfirm={() => pick.mutateAsync(finalId).then(() => toast({ title: t("pickedToast"), tone: "success" }))}
      />
    </>
  );

  if (!date || !poll.canClose || poll.finalOptionId) {
    return (
      <ProductCard as="section" aria-labelledby={`poll-q-${poll.id}`} className="flex flex-col gap-3">
        {body}
        {!date && poll.canClose && !poll.closed ? (
          <Button variant="secondary" className="self-start" disabled={close.isPending} onClick={() => close.mutate(undefined, { onSuccess: () => toast({ title: t("closeToast") }) })}>
            {t("close")}
          </Button>
        ) : null}
      </ProductCard>
    );
  }
  return (
    <SignatureCard as="section" aria-labelledby={`poll-q-${poll.id}`} contentClassName="flex flex-col gap-3" action={<SignatureCardAction label={t("pickFinal")} icon={CalendarCheck} aria-haspopup="dialog" onClick={() => setPicking(true)} />}>
      {body}
      <fieldset className="flex flex-col gap-1.5 border-t border-line pt-3">
        <legend className="mb-1 text-xs font-bold tracking-wide text-fg-muted uppercase">{t("pickFinal")}</legend>
        <RadioGroup value={finalId} onValueChange={setFinalId}>
          {poll.options.map((o) => (
            <RadioGroupItem key={o.id} value={o.id} label={label(o)} />
          ))}
        </RadioGroup>
      </fieldset>
    </SignatureCard>
  );
}

const CELL: Record<FreeBusyCell, string> = {
  free: "bg-scope-soft",
  busy: "bg-fg-muted/45",
  "not-shared": "bg-[repeating-linear-gradient(135deg,var(--border-default)_0_3px,transparent_3px_7px)]",
};

function FreeBusyCard({ activityId }: { activityId: string }) {
  const t = useTranslations("Social.freeBusy");
  const format = useSocialFormat();
  const data = useFreeBusy(activityId);
  const share = useSocialMutation((repo, value: boolean) => repo.freeBusy.share(activityId, value));
  const ask = useSocialMutation((repo, personId: string) => repo.freeBusy.request(activityId, personId));
  const gate = queryGate([data]);
  if (gate) return gate;
  const view: FreeBusyView = data.data!;
  const me = view.rows.find((r) => r.person.id === "me");
  const state = (cell: FreeBusyCell) => (cell === "free" ? t("free") : cell === "busy" ? t("busy") : t("notShared"));
  const askButton = (row: FreeBusyView["rows"][number]) =>
    row.person.id === "me" ? null : row.consent === "requested" ? (
      <span className="text-xs font-semibold text-fg-muted">{t("asked")}</span>
    ) : row.consent === "none" || row.consent === "declined" ? (
      <Button size="sm" variant="ghost" disabled={ask.isPending} onClick={() => ask.mutate(row.person.id)}>
        {t("ask")}
      </Button>
    ) : null;
  return (
    <ProductCard as="section" aria-labelledby="free-busy" className="flex flex-col gap-3">
      <h2 id="free-busy" className="type-title text-fg">
        {t("title")}
      </h2>
      <p className="text-xs text-fg-secondary">{t("note")}</p>
      {view.incomingRequest ? (
        <div role="region" aria-labelledby="consent-title" className="flex flex-col gap-2 rounded-row bg-scope-soft p-4">
          <h3 id="consent-title" className="text-sm font-bold text-scope-deep">
            {t("consentTitle")}
          </h3>
          <p className="text-sm text-fg">
            {t("consentBody", { name: view.incomingRequest.from.name, range: format.range(view.incomingRequest.range.from, view.incomingRequest.range.to) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => share.mutate(false)}>
              {t("notNow")}
            </Button>
            <Button size="sm" onClick={() => share.mutate(true)}>
              {t("share")}
            </Button>
          </div>
        </div>
      ) : me?.consent === "shared" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-row bg-subtle px-3 py-2">
          <p className="text-xs font-semibold text-fg-secondary">{t("shared")}</p>
          <Button size="sm" variant="ghost" onClick={() => share.mutate(false)}>
            {t("stop")}
          </Button>
        </div>
      ) : null}
      {/* Desktop / tablet: grid of people × days × slots. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                {t("title")}
              </th>
              {view.rows[0]?.days.map((d) => (
                <th key={d.day} scope="colgroup" colSpan={view.slots.length} className="px-1 text-center font-bold text-fg-secondary">
                  {format.day(d.day, "weekdayShort")} {format.day(d.day, "day")}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.person.id}>
                <th scope="row" className="pe-2 text-start font-semibold whitespace-nowrap text-fg">
                  <bdi>{row.person.name}</bdi>
                </th>
                {row.days.flatMap((d) =>
                  d.slots.map((cell, i) => (
                    <td key={`${d.day}-${i}`} className="p-0">
                      <span
                        role="img"
                        aria-label={t("cell", { person: row.person.name, day: format.day(d.day), slot: convertDigits(view.slots[i]!, format.digits), state: state(cell) })}
                        className={cn("block h-7 min-w-7 rounded-md", CELL[cell])}
                      />
                    </td>
                  )),
                )}
                <td className="ps-1">{askButton(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 flex flex-wrap gap-3 text-xs text-fg-secondary">
          {(["free", "busy", "not-shared"] as const).map((cell) => (
            <span key={cell} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("inline-block size-3.5 rounded-sm", CELL[cell])} />
              {state(cell)}
            </span>
          ))}
        </p>
      </div>
      {/* Phone: simplified list per person. */}
      <ul className="flex flex-col gap-2 sm:hidden">
        {view.rows.map((row) => {
          const free = row.days.flatMap((d) => d.slots.map((cell, i) => ({ cell, label: `${format.day(d.day)} ${convertDigits(view.slots[i]!, format.digits)}` }))).filter((x) => x.cell === "free");
          return (
            <li key={row.person.id} className="flex items-center gap-3 rounded-row bg-subtle px-3 py-2">
              <PersonAvatar person={row.person} />
              <span className="flex min-w-0 flex-1 flex-col">
                <bdi className="text-sm font-semibold text-fg">{row.person.name}</bdi>
                <span className="text-xs text-fg-secondary">{row.consent === "shared" ? free.map((f) => f.label).join(" · ") || t("busy") : t("notShared")}</span>
              </span>
              {askButton(row)}
            </li>
          );
        })}
      </ul>
    </ProductCard>
  );
}
