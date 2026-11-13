"use client";

import { Plus, Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import type { Thing } from "@/data/social-domain";
import { useLoans, useLostFound, useMyThings, useSocialDirectory, useSocialMutation } from "@/data/social-queries";
import { FolderTabsCard } from "@/design-system/surfaces/folder-tabs-card";
import { useSocialFormat } from "../format";
import { LoanCard, LoanRow, LostFoundList, ThingRow } from "../lending/lending-parts";
import { useOpenSocialSheet } from "../sheets/social-sheet-params";
import { queryGate, SocialPageHeader } from "../social-ui";

/*
 * SO-18 · My things & lending (/social/lending). A private inventory: lend
 * directly to a connection (?sheet=item-lend) or share with groups so their
 * members can ask. Loans use the SO-10 flow and loan card (two-sided
 * handover / return, problems, no fines). Borrowed: what I hold, with due
 * dates and Return. Lost & found: my posts and claims across groups. No
 * addresses anywhere — the handover place is free text.
 */
export function MyThingsScreen() {
  const t = useTranslations("Social.things");
  const format = useSocialFormat();
  const openSheet = useOpenSocialSheet();
  const things = useMyThings();
  const loans = useLoans(null);
  const posts = useLostFound(null);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const gate = queryGate([things, loans, posts]);
  if (gate) return gate;
  const live = loans.data!.filter((l) => l.status !== "declined" && l.status !== "returned");
  const lent = live.filter((l) => l.iAmLender);
  const borrowed = live.filter((l) => !l.iAmLender);
  const selected = live.find((l) => l.id === selectedId) ?? live.find((l) => l.myStep) ?? live[0];
  const list = (items: typeof live) =>
    items.length === 0 ? (
      <p className="p-2 text-sm text-fg-secondary">{t("none")}</p>
    ) : (
      <ul className="flex flex-col gap-2">
        {items.map((l) => <LoanRow key={l.id} loan={l} selected={l.id === selected?.id} onSelect={() => setSelectedId(l.id)} />)}
      </ul>
    );
  return (
    <>
      <SocialPageHeader
        trail={[{ label: t("title") }]}
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <Button variant="secondary" aria-haspopup="dialog" onClick={() => openSheet("item-lend")}>{t("lendTo")}</Button>
            <Button className="gap-2" aria-haspopup="dialog" onClick={() => openSheet("thing-new")}><Icon icon={Plus} size={16} />{t("add")}</Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <FolderTabsCard
          label={t("tabs.label")}
          defaultValue="mine"
          tabs={[
            {
              value: "mine",
              label: t("tabs.mine"),
              count: format.number(things.data!.length),
              content: things.data!.length === 0 ? <p className="p-2 text-sm text-fg-secondary">{t("none")}</p> : (
                <ul className="flex flex-col gap-2">
                  {things.data!.map((thing) => (
                    <ThingRow
                      key={thing.id}
                      thing={thing}
                      action={
                        <span className="flex gap-1.5">
                          <ShareMenu thing={thing} />
                          {!thing.activeLoanId ? <Button size="sm" variant="secondary" aria-haspopup="dialog" onClick={() => openSheet("item-lend", { thing: thing.id })}>{t("lendTo")}</Button> : null}
                        </span>
                      }
                    />
                  ))}
                </ul>
              ),
            },
            { value: "lent", label: t("tabs.lent"), count: format.number(lent.length), content: list(lent) },
            { value: "borrowed", label: t("tabs.borrowed"), count: format.number(borrowed.length), content: list(borrowed) },
            { value: "lost", label: t("tabs.lostFound"), count: format.number(posts.data!.length), content: <LostFoundList posts={posts.data!} showGroup /> },
          ]}
        />
        <div className="flex min-w-0 flex-col gap-4">
          {selected ? <LoanCard key={selected.id} loan={selected} /> : null}
          <p className="text-xs text-fg-muted">{t("privacy")}</p>
        </div>
      </div>
    </>
  );
}

function ShareMenu({ thing }: { thing: Thing }) {
  const t = useTranslations("Social.things");
  const directory = useSocialDirectory();
  const share = useSocialMutation((repo, input: { groupId: string; on: boolean }) => repo.lending.share(thing.id, input.groupId, input.on));
  const shared = new Set(thing.sharedWith.map((g) => g.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="ghost" className="gap-1.5" title={shared.size ? t("sharedWith", { groups: thing.sharedWith.map((g) => g.name).join(", ") }) : t("notShared")}>
          <Icon icon={Share2} size={14} />
          <span className="sr-only sm:not-sr-only">{shared.size ? t("sharedWith", { groups: String(shared.size) }) : t("notShared")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-64 flex-col gap-2 p-3" data-scope="social">
        <p className="text-sm font-bold">{t("shareWith")}</p>
        {(directory.data?.groups ?? []).map((g) => (
          <Checkbox
            key={g.id}
            checked={shared.has(g.id)}
            onCheckedChange={(checked) => share.mutate({ groupId: g.id, on: checked === true }, { onSuccess: () => toast({ title: t("shareSaved") }) })}
            label={<bdi>{g.name}</bdi>}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
