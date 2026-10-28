"use client";

import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import type { EnergyLevel, MoodLevel } from "@/data/domain";
import { useJournalCheckIn, useRevertJournal } from "@/data/queries";
import { usePlannerNow } from "@/features/my-day/my-day-context";
import { moodKey } from "@/features/overview/ui/mood";
import { EnergySwitch, MoodPicker } from "./ui/mood-picker";

/*
 * Mood check-in (P18 · D): five moods, three energies, an optional word.
 * Two taps minimum (mood, Save). Saved on today's Journal entry, with Undo.
 * A popover where a screen anchors it; from the URL a compact centred sheet.
 */

export function MoodCheckIn({ onClose }: { onClose(): void }) {
  const t = useTranslations("Journal.checkIn");
  const tj = useTranslations("Journal");
  const tt = useTranslations("Journal.toast");
  const { day: today } = usePlannerNow();
  const ids = useId();
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [energy, setEnergy] = useState<EnergyLevel>("medium");
  const [note, setNote] = useState("");
  const checkIn = useJournalCheckIn();
  const revert = useRevertJournal();

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (mood === null) return;
    checkIn.mutate(
      { day: today, mood, energy, note },
      {
        onSuccess: ({ previous }) => {
          toast({
            tone: "neutral",
            title: tt("checkedIn"),
            description: tt("checkedInBody", { mood: tj(`moodLevel.${moodKey(mood)}`), energy: tj("energyText", { level: energy }) }),
            action: { label: tt("undo"), altText: tt("undoAlt"), onClick: () => revert.mutate({ day: today, previous }) },
          });
          onClose();
        },
        onError: () => toast({ tone: "danger", title: tt("failed") }),
      },
    );
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-4" data-mood-check-in>
      <div className="flex flex-col gap-2">
        <p id={`${ids}-q`} className="text-sm font-bold text-fg">
          {t("question")}
        </p>
        <MoodPicker compact allowClear={false} labelledBy={`${ids}-q`} value={mood} onChange={setMood} levelLabel={(level) => tj(`moodLevel.${moodKey(level)}`)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-bold text-fg">{t("energy")}</span>
        <EnergySwitch label={t("energy")} value={energy} onChange={setEnergy} levelLabel={(level) => tj(`energyLevel.${level}`)} />
      </div>
      <Input dir="auto" aria-label={t("note")} placeholder={t("note")} value={note} onChange={(event) => setNote(event.target.value)} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-fg-muted">{t("hint")}</p>
        <Button type="submit" disabled={mood === null} loading={checkIn.isPending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
