"use client";

import { Lock, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useJournalEntry } from "@/data/queries";
import { UtilityCard } from "@/design-system/surfaces/utility-card";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { resolveJournalDay } from "./domain/journal";
import { JournalComposer } from "./journal-composer";
import { JournalRecent } from "./journal-recent";
import { JournalTrend } from "./journal-trend";

/*
 * P14 · Journal (/personal/journal/:date?). Writing first: the composer takes
 * the main column; the side column holds the one trend visual (compact Mood
 * Terrain) and Recent. A missing, malformed or future :date shows today.
 * Locked (Settings › Privacy · Journal lock, a placeholder): content stays
 * hidden until Unlock, for this visit; "Lock" hides it again.
 */

export function JournalScreen({ date }: { date: string | null }) {
  const t = useTranslations("Journal");
  const { day: today } = usePlannerNow();
  const settings = usePlannerSettings();
  const [unlocked, setUnlocked] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const day = resolveJournalDay(date, today);
  const locked = settings.privacy.journalLock && !unlocked;
  const entry = useJournalEntry(day);

  return (
    <div className="flex flex-col gap-5" data-screen="journal" data-journal-day={day}>
      <PageHeader
        title={t("title")}
        subtitle={t("kicker")}
        subtitlePlacement="above"
        actions={
          locked ? null : (
            <div className="flex flex-wrap items-center gap-2">
              {settings.privacy.journalLock ? (
                <Button variant="secondary" onClick={() => setUnlocked(false)}>
                  <Lock aria-hidden size={16} />
                  {t("lockNow")}
                </Button>
              ) : null}
              <Button variant="secondary" onClick={() => searchRef.current?.focus()}>
                <Search aria-hidden size={16} />
                {t("searchEntries")}
              </Button>
            </div>
          )
        }
      />
      {locked ? (
        <LockedJournal onUnlock={() => setUnlocked(true)} />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {entry.isPending ? (
            <Skeleton className="h-[30rem] rounded-card" />
          ) : entry.isError ? (
            <UtilityCard role="alert" className="flex flex-col items-start gap-3">
              <p className="text-sm text-fg-secondary">{t("error")}</p>
              <Button variant="secondary" size="sm" onClick={() => void entry.refetch()}>
                {t("retry")}
              </Button>
            </UtilityCard>
          ) : (
            // Keyed by day: opening another day seeds a fresh draft (the old one saves on the way out).
            <JournalComposer key={day} day={day} today={today} entry={entry.data ?? null} />
          )}
          <div className="flex min-w-0 flex-col gap-5">
            <JournalTrend day={day} />
            <JournalRecent day={day} today={today} searchRef={searchRef} />
          </div>
        </div>
      )}
    </div>
  );
}

function LockedJournal({ onUnlock }: { onUnlock(): void }) {
  const t = useTranslations("Journal.locked");
  return (
    <UtilityCard as="section" aria-labelledby="journal-locked-title" className="flex flex-col items-center gap-3 py-12 text-center" data-journal-locked>
      <span aria-hidden="true" className="grid size-14 place-items-center rounded-full bg-surface text-fg">
        <Lock size={22} />
      </span>
      <h2 id="journal-locked-title" className="text-lg font-bold text-fg">
        {t("title")}
      </h2>
      <p className="max-w-sm text-sm text-fg-secondary">{t("body")}</p>
      {/* PIN placeholder: four empty dots until the real lock exists. */}
      <span role="img" aria-label={t("pin")} className="flex gap-2">
        {[0, 1, 2, 3].map((dot) => (
          <span key={dot} className="size-3 rounded-full inset-ring-2 inset-ring-outline" />
        ))}
      </span>
      <Button onClick={onUnlock}>{t("unlock")}</Button>
    </UtilityCard>
  );
}
