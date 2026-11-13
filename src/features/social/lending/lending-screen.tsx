"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { Thing } from "@/data/social-domain";
import { useGroupThings, useLoans, useLostFound, useSocialMutation } from "@/data/social-queries";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { useSocialFormat } from "../format";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { useSocialGroup } from "../social-gate";
import { queryGate, SocialPageHeader } from "../social-ui";
import { LoanCard, LoanRow, LostFoundList, RequestDialog, ThingRow } from "./lending-parts";

/*
 * SO-10 · Lending & lost/found (/social/groups/[id]/lending). Things
 * (personal ones shared with the group, or group-owned with a keeper), loans
 * with two-sided handover / return confirmations, problems documented and
 * resolved by both sides (no fines), lost & found without a loan. Loan
 * signature card: notch = the confirmation due for the viewer.
 */
export function LendingScreen() {
  const t = useTranslations("Social.lending");
  const group = useSocialGroup();
  const format = useSocialFormat();
  const openSheet = useOpenSocialSheet();
  const things = useGroupThings(group.id);
  const loans = useLoans(group.id);
  const posts = useLostFound(group.id);
  const [requesting, setRequesting] = useState<Thing | null>(null);
  const [posting, setPosting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const gate = queryGate([things, loans, posts]);
  if (gate) return gate;
  const active = loans.data!.filter((l) => l.status !== "declined");
  const selected = active.find((l) => l.id === selectedId) ?? active.find((l) => l.myStep) ?? active[0];
  return (
    <>
      <SocialPageHeader
        group={group}
        trail={[{ label: t("title") }]}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("thing-new", { group: group.id })}>
            <Icon icon={Plus} size={16} />
            {t("addThing")}
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <FolderTabsCard
          label={t("tabs.label")}
          defaultValue="loans"
          tabs={[
            {
              value: "things",
              label: t("tabs.things"),
              count: format.number(things.data!.length),
              content:
                things.data!.length === 0 ? (
                  <p className="p-2 text-sm text-fg-secondary">{t("noThings")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {things.data!.map((thing) => (
                      <ThingRow
                        key={thing.id}
                        thing={thing}
                        action={!thing.activeLoanId && thing.keeper.id !== "me" ? (
                          <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => setRequesting(thing)}>{t("request")}</Button>
                        ) : null}
                      />
                    ))}
                  </ul>
                ),
            },
            {
              value: "loans",
              label: t("tabs.loans"),
              count: format.number(active.length),
              content: active.length === 0 ? (
                <p className="p-2 text-sm text-fg-secondary">{t("noLoans")}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {active.map((loan) => (
                    <LoanRow key={loan.id} loan={loan} selected={loan.id === selected?.id} onSelect={() => setSelectedId(loan.id)} />
                  ))}
                </ul>
              ),
            },
            {
              value: "lost",
              label: t("tabs.lostFound"),
              count: format.number(posts.data!.filter((p) => !p.resolved).length),
              content: (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-fg-muted">{t("lostFound.worksWithoutLoan")}</p>
                  <LostFoundList posts={posts.data!} />
                  <Button size="sm" variant="secondary" className="self-start" aria-haspopup="dialog" onClick={() => setPosting(true)}>{t("lostFound.post")}</Button>
                </div>
              ),
            },
          ]}
        />
        <div className="flex min-w-0 flex-col gap-4">{selected ? <LoanCard key={selected.id} loan={selected} /> : null}</div>
      </div>
      {requesting ? <RequestDialog thing={requesting} onClose={() => setRequesting(null)} /> : null}
      {posting ? <PostDialog groupId={group.id} onClose={() => setPosting(false)} /> : null}
    </>
  );
}

function PostDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const t = useTranslations("Social");
  const [kind, setKind] = useState<"missing" | "found">("missing");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const post = useSocialMutation((repo) => repo.lostFound.post(groupId, kind, title, note));
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent title={t("lending.lostFound.postTitle")} description={t("lending.placeHint")}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            post.mutate(undefined, { onSuccess: onClose });
          }}
        >
          <RadioGroup value={kind} onValueChange={(value) => setKind(value as "missing" | "found")} aria-label={t("lending.lostFound.kind")}>
            <RadioGroupItem value="missing" label={t("lending.lostFound.missing")} />
            <RadioGroupItem value="found" label={t("lending.lostFound.found")} />
          </RadioGroup>
          <Field>
            <FieldLabel>{t("lending.lostFound.what")}</FieldLabel>
            <Input dir="auto" value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>{t("lending.lostFound.note")}</FieldLabel>
            <Textarea dir="auto" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" disabled={!title.trim() || post.isPending}>{t("lending.lostFound.post")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
