"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { EmptyState } from "@/components/feedback/state-views";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast";
import { getPlannerToday } from "@/data/clock";
import type { Challenge } from "@/data/social-domain";
import { useChallenges, useSocialMutation } from "@/data/social-queries";
import { DayField } from "@/features/goals/goal-sheet";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { SignatureCard, SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { toLatinDigits } from "@/lib/locale/digits";
import { useSocialFormat } from "../format";
import { useSocialGroup } from "../social-gate";
import { queryGate, SocialPageHeader } from "../social-ui";
import { useSocialErrorText } from "../use-social";

/*
 * SO-12 · Challenges (/social/groups/[id]/challenges). Voluntary: opt in,
 * leave anytime, no auto-enrolment. Progress is typed in the challenge only
 * — nothing is pulled or published from Personal habits. Group goal by
 * default; individual totals only when the owner turns them on, A–Z and
 * never ranked (S9). Signature card for a joined challenge: notch Log
 * progress. Progress = number + linear bar (no rings, no gauges).
 */
export function ChallengesScreen() {
  const t = useTranslations("Social.challenges");
  const group = useSocialGroup();
  const challenges = useChallenges(group.id);
  const [logging, setLogging] = useState<Challenge | null>(null);
  const [creating, setCreating] = useState(false);
  const gate = queryGate([challenges]);
  if (gate) return gate;
  const joined = challenges.data!.filter((c) => c.joined);
  const open = challenges.data!.filter((c) => !c.joined);
  return (
    <>
      <SocialPageHeader
        group={group}
        trail={[{ label: t("title") }]}
        title={t("title")}
        subtitle={t("voluntary")}
        actions={<Button className="gap-2" aria-haspopup="dialog" onClick={() => setCreating(true)}><Icon icon={Plus} size={16} />{t("newTitle")}</Button>}
      />
      {challenges.data!.length === 0 ? <EmptyState title={t("none")} /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {joined.map((c) => (
          <SignatureCard key={c.id} as="section" aria-labelledby={`ch-${c.id}`} contentClassName="flex flex-col gap-3" action={<SignatureCardAction label={t("log")} icon={Plus} aria-haspopup="dialog" onClick={() => setLogging(c)} />}>
            <ChallengeBody challenge={c} />
          </SignatureCard>
        ))}
        {open.length > 0 ? (
          <ProductCard as="section" aria-labelledby="open-challenges" className="flex flex-col gap-3">
            <h2 id="open-challenges" className="type-title text-fg">{t("open")}</h2>
            <ul className="flex flex-col gap-3">
              {open.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 rounded-row bg-subtle p-3">
                  <ChallengeBody challenge={c} compact />
                </li>
              ))}
            </ul>
          </ProductCard>
        ) : null}
      </div>
      <p className="text-xs text-fg-muted">{t("privacy")}</p>
      {logging ? <LogDialog challenge={logging} onClose={() => setLogging(null)} /> : null}
      {creating ? <CreateDialog groupId={group.id} onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function ChallengeBody({ challenge: c, compact = false }: { challenge: Challenge; compact?: boolean }) {
  const t = useTranslations("Social.challenges");
  const format = useSocialFormat();
  const group = useSocialGroup();
  const errorText = useSocialErrorText();
  const membership = useSocialMutation((repo, join: boolean) => (join ? repo.challenges.join(c.id) : repo.challenges.leave(c.id)));
  const totals = useSocialMutation((repo, on: boolean) => repo.challenges.setIndividualTotals(c.id, on));
  const pct = Math.min(100, (c.total / c.target) * 100);
  const Heading = compact ? "h3" : "h2";
  return (
    <>
      {!compact ? <p className="pe-16 text-xs font-bold tracking-wide text-scope-deep uppercase">{t("ends", { date: format.day(c.endDay) })}</p> : null}
      <Heading id={`ch-${c.id}`} className={compact ? "text-sm font-bold text-fg" : "pe-16 type-h2 text-fg"}><bdi>{c.title}</bdi></Heading>
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-fg-muted">{t("groupTotal")}</p>
        <p className="text-sm font-bold text-fg">{t("ofTarget", { total: format.number(c.total), target: format.number(c.target), unit: c.unit })} · {t("participants", { count: c.participants, n: format.number(c.participants) })}</p>
        <div role="img" aria-label={t("ofTarget", { total: format.number(c.total), target: format.number(c.target), unit: c.unit })} className="h-2 overflow-hidden rounded-pill bg-subtle">
          <span className="block h-full rounded-pill bg-scope-deep" style={{ inlineSize: `${pct}%` }} />
        </div>
      </div>
      {c.joined ? <p className="text-sm text-fg">{t("mine")}: <span className="font-bold tabular">{format.number(c.myTotal)} {c.unit}</span></p> : null}
      {c.individualTotals ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-fg-muted">{t("individual")}</p>
          <ul className="flex flex-col gap-0.5 text-sm">
            {c.individualTotals.map((row) => (
              <li key={row.person.id} className="flex justify-between gap-2"><bdi>{row.person.name}</bdi><span className="tabular">{format.number(row.total)} {c.unit}</span></li>
            ))}
          </ul>
        </div>
      ) : null}
      {group.myRole === "owner" && !compact ? <Switch checked={c.individualTotals !== null} onCheckedChange={(on) => totals.mutate(on)} label={t("showTotals")} /> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={c.joined ? "ghost" : "primary"}
          disabled={membership.isPending}
          onClick={() => membership.mutate(!c.joined, { onSuccess: () => toast({ title: c.joined ? t("leftToast", { title: c.title }) : t("joinedToast", { title: c.title }) }), onError: (e) => toast({ title: errorText(e), tone: "danger" }) })}
        >
          {c.joined ? t("leave") : t("join")}
        </Button>
      </div>
    </>
  );
}

function LogDialog({ challenge: c, onClose }: { challenge: Challenge; onClose: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState<string | null>(getPlannerToday() > c.endDay ? c.endDay : getPlannerToday());
  const value = Number(toLatinDigits(amount.trim()));
  const ok = amount.trim() !== "" && Number.isSafeInteger(value) && value > 0;
  const log = useSocialMutation((repo) => repo.challenges.log(c.id, value, day!));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("challenges.logTitle", { title: c.title })} description={t("challenges.privacy")}>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (!ok || !day) return; log.mutate(undefined, { onSuccess: () => { toast({ title: t("challenges.logged"), tone: "success" }); onClose(); } }); }}>
          <Field invalid={amount !== "" && !ok}>
            <FieldLabel>{t("challenges.amount", { unit: c.unit })}</FieldLabel>
            <Input dir="ltr" inputMode="numeric" className="tabular" value={amount} onChange={(event) => setAmount(event.target.value)} />
            {amount !== "" && !ok ? <FieldError>{t("sheets.activityNew.capacityInvalid")}</FieldError> : null}
          </Field>
          <DayField label={t("challenges.day")} emptyLabel={t("challenges.day")} value={day} onChange={setDay} />
          {log.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(log.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!ok || log.isPending}>{t("challenges.log")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const t = useTranslations("Social");
  const errorText = useSocialErrorText();
  const [title, setTitle] = useState("");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [endDay, setEndDay] = useState<string | null>(null);
  const value = Number(toLatinDigits(target.trim()));
  const ok = title.trim() !== "" && unit.trim() !== "" && Number.isSafeInteger(value) && value > 0 && endDay !== null;
  const create = useSocialMutation((repo) => repo.challenges.create(groupId, { title, unit, target: value, endDay: endDay! }));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("challenges.newTitle")} description={t("challenges.voluntary")}>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); if (!ok) return; create.mutate(undefined, { onSuccess: onClose }); }}>
          <Field><FieldLabel>{t("challenges.name")}</FieldLabel><Input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel>{t("challenges.amount", { unit: "" }).replace(/\s*\(\)\s*/, "")}</FieldLabel><Input dir="ltr" inputMode="numeric" className="tabular" value={target} onChange={(event) => setTarget(event.target.value)} /></Field>
            <Field><FieldLabel>{t("challenges.unit")}</FieldLabel><Input dir="auto" value={unit} onChange={(event) => setUnit(event.target.value)} /></Field>
          </div>
          <DayField label={t("challenges.endDay")} emptyLabel={t("challenges.endDay")} value={endDay} onChange={setEndDay} />
          {create.isError ? <p className="text-sm font-semibold text-danger-text">{errorText(create.error)}</p> : null}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!ok || create.isPending}>{t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
