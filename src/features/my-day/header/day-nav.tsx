"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useMyDay } from "../my-day-context";

/*
 * Previous / next day: two 56px circles. The chevrons mirror under RTL, where
 * "previous" points right. A small "Today" button appears only away from
 * today, so the way back is one tap.
 */

const NAV_BUTTON = "size-14 bg-surface hover:bg-raised";

export function DayNav({ className }: { className?: string }) {
  const t = useTranslations("MyDay.header.nav");
  const { isToday, shiftDay, goToToday } = useMyDay();

  return (
    <div role="group" aria-label={t("group")} className={cn("flex items-center gap-2", className)}>
      {isToday ? null : (
        <Button variant="ghost" size="sm" onClick={goToToday}>
          {t("today")}
        </Button>
      )}
      <IconButton
        icon={ChevronLeft}
        mirror
        size="lg"
        label={t("previous")}
        className={NAV_BUTTON}
        onClick={() => shiftDay(-1)}
      />
      <IconButton
        icon={ChevronRight}
        mirror
        size="lg"
        label={t("next")}
        className={NAV_BUTTON}
        onClick={() => shiftDay(1)}
      />
    </div>
  );
}
