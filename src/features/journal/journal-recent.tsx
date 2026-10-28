"use client";

import { BookOpen, ChevronLeft, ChevronRight, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type Ref } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import type { JournalEntry } from "@/data/domain";
import { useJournalEntries, useRevertJournal } from "@/data/queries";
import { ProductCard } from "@/design-system/surfaces/product-card";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { moodKey } from "@/features/overview/ui/mood";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useTasksFormat } from "@/features/tasks/ui/use-tasks-format";
import { dayToLocalDate, instantToClockTime } from "@/lib/dates/clock-time";
import { formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/cn";
import { excerpt, hasWriting, journalHref, matchesSearch, monthOf, shiftMonthOf } from "./domain/journal";
import { JOURNAL_TEXT_ID } from "./journal-composer";
import { MOOD_DOT } from "./ui/mood-picker";

/*
 * Recent (P14): the month's entries as product cards, newest first, the shown
 * day left out (it is in the composer). Month switch (no future months),
 * search over words and #tags. A check-in-only entry is a slim row
 * "Good · Medium energy · 09:10" with Write. Delete has Undo. No entries at
 * all: the Empty state, whose CTA puts the cursor in the composer.
 */

export function JournalRecent({ day, today, searchRef }: { day: string; today: string; searchRef?: Ref<HTMLInputElement> }) {
  const t = useTranslations("Journal.recent");
  const te = useTranslations("Journal.empty");
  const tt = useTranslations("Journal.toast");
  const tj = useTranslations("Journal");
  const format = useTasksFormat();
  const { calendar, locale, digits } = usePreferences();
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const base = monthOf(day, calendar);
  const month = offset ? shiftMonthOf(base, offset, calendar) : base;
  const entries = useJournalEntries(month.start, month.end);
  const revert = useRevertJournal();
  const atCurrent = month.end >= monthOf(today, calendar).end;

  const listed = (entries.data ?? []).filter((entry) => entry.day !== day);
  const shown = listed.filter((entry) => matchesSearch(entry, query));
  const dateText = (entryDay: string) => `${format.weekdayShort(entryDay)} ${format.dayMonth(entryDay)}`;

  const remove = (entry: JournalEntry) =>
    revert.mutate(
      { day: entry.day, previous: null },
      {
        onSuccess: () =>
          toast({
            tone: "neutral",
            title: tt("deleted"),
            action: { label: tt("undo"), altText: tt("undoAlt"), onClick: () => revert.mutate({ day: entry.day, previous: entry }, { onError: () => toast({ tone: "danger", title: tt("failed") }) }) },
          }),
        onError: () => toast({ tone: "danger", title: tt("failed") }),
      },
    );

  const empty = entries.isSuccess && offset === 0 && (entries.data ?? []).length === 0;

  return (
    <section aria-labelledby="journal-recent-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <h2 id="journal-recent-title" className="type-title text-fg">
          {t("title")}
        </h2>
        <div role="group" aria-label={t("month")} className="flex items-center gap-1">
          <IconButton size="sm" variant="ghost" icon={ChevronLeft} mirror label={t("prevMonth")} onClick={() => setOffset((value) => value - 1)} />
          <span aria-live="polite" className="min-w-20 text-center text-xs font-bold text-fg">
            {formatDate(dayToLocalDate(month.start), "monthYear", { calendar, locale, digits })}
          </span>
          <IconButton size="sm" variant="ghost" icon={ChevronRight} mirror label={t("nextMonth")} disabled={atCurrent} onClick={() => setOffset((value) => value + 1)} />
          <span className="ms-1 text-xs font-semibold text-fg-muted">{t("count", { count: listed.length })}</span>
        </div>
      </div>

      {empty ? (
        <UtilityCard as="div" className="flex flex-col items-center gap-3 py-10 text-center" data-journal-empty>
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface text-fg">
            <BookOpen size={22} />
          </span>
          <h3 className="text-lg font-bold text-fg">{te("title")}</h3>
          <p className="max-w-xs text-sm text-fg-secondary">{te("body")}</p>
          <Button onClick={() => document.getElementById(JOURNAL_TEXT_ID)?.focus()}>{te("cta")}</Button>
        </UtilityCard>
      ) : (
        <>
          <label className="relative block">
            <span className="sr-only">{t("search")}</span>
            <Search aria-hidden size={16} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-fg-muted" />
            <Input ref={searchRef} type="search" dir="auto" value={query} placeholder={t("search")} onChange={(event) => setQuery(event.target.value)} className="ps-9" />
          </label>
          {entries.isPending ? (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-20 rounded-card" />
              <Skeleton className="h-20 rounded-card" />
            </div>
          ) : entries.isError ? (
            <UtilityCard role="alert" className="flex flex-col items-start gap-3">
              <p className="text-sm text-fg-secondary">{tj("error")}</p>
              <Button variant="secondary" size="sm" onClick={() => void entries.refetch()}>
                {tj("retry")}
              </Button>
            </UtilityCard>
          ) : shown.length === 0 ? (
            <p className="px-1 py-4 text-sm text-fg-secondary">{query.trim() ? t("noMatch", { query: query.trim() }) : t("noneThisMonth")}</p>
          ) : (
            <ul aria-label={t("list")} className="flex flex-col gap-2">
              {shown.map((entry) => {
                const href = journalHref(entry.day, today);
                const written = hasWriting(entry);
                const moodLine =
                  entry.mood !== null && entry.energy !== null ? (
                    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs font-semibold text-fg-secondary">
                      <span aria-hidden className={cn("size-2 rounded-full", MOOD_DOT[entry.mood])} />
                      <span className="font-bold text-fg">{tj(`moodLevel.${moodKey(entry.mood)}`)}</span>
                      <span>· {tj("energyText", { level: entry.energy })}</span>
                      {!written && entry.checkedInAt ? (
                        <span dir="ltr" className="tabular">
                          · {format.clock(instantToClockTime(entry.checkedInAt))}
                        </span>
                      ) : null}
                    </span>
                  ) : null;
                return (
                  <li key={entry.day} data-journal-entry={entry.day} data-check-in-only={written ? undefined : "true"}>
                    <ProductCard className={cn("flex items-start gap-3", written ? "py-3.5" : "py-2.5")}>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <Link href={href} aria-label={t("open", { date: dateText(entry.day) })} className="text-sm font-bold text-fg underline-offset-4 hover:underline focus-visible:focus-ring rounded-sm">
                            {dateText(entry.day)}
                          </Link>
                          {moodLine}
                        </div>
                        {written ? (
                          <p dir="auto" className="line-clamp-2 text-sm text-fg-secondary">
                            {excerpt(entry)}
                          </p>
                        ) : (
                          <p className="text-xs text-fg-muted">{t("checkInOnly")}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {entry.tags.slice(0, 2).map((tag) => (
                          <span key={tag} className="hidden rounded-pill px-2.5 py-1 text-[0.6875rem] font-bold text-fg-secondary inset-ring inset-ring-outline sm:inline-flex">
                            <bdi dir="auto">#{tag}</bdi>
                          </span>
                        ))}
                        {written ? null : (
                          <Button asChild size="sm" variant="secondary">
                            <Link href={href}>{t("write")}</Link>
                          </Button>
                        )}
                        <IconButton size="sm" variant="ghost" icon={Trash2} label={t("delete", { date: dateText(entry.day) })} onClick={() => remove(entry)} />
                      </div>
                    </ProductCard>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
