"use client";

import { Ellipsis, Moon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { IconButton } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { useMyDay } from "../my-day-context";
import { useMyDayFormat } from "../ui/use-my-day-format";
import { CapacityPill } from "./capacity-pill";
import { DayNav } from "./day-nav";
import { EnergySelector } from "./energy-selector";

/*
 * P02 page header: the date kicker and the "My Day" title at the start;
 * Energy, Capacity and the day arrows at the end. Below lg the header is the
 * PM01 phone version: kicker, title and one chip with the free time (the
 * Energy selector and the arrows have no mobile home; the week strip and
 * Calendar move between days there).
 *
 * `variant` forces one layout (tests, the styleguide); the default switches
 * with CSS so server and first paint are right at every width.
 */

export type MyDayHeaderVariant = "responsive" | "desktop" | "compact";

export function MyDayHeader({
  variant = "responsive",
  className,
}: {
  variant?: MyDayHeaderVariant;
  className?: string;
}) {
  const t = useTranslations("MyDay.header");
  const format = useMyDayFormat();
  const { locale } = usePreferences();
  const { day } = useMyDay();

  const showDesktop = variant !== "compact";
  const showCompact = variant !== "desktop";

  // The phone kicker is short ("Tue 21 Mehr"); Persian weekday names are already short.
  const weekday = format.weekday(day);
  const compactKicker = `${locale === "en" ? weekday.slice(0, 3) : weekday} ${format.dayMonth(day)}`;

  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-3 gap-y-3", className)}>
      {/* The title never wraps or shrinks: when the controls do not fit beside it they drop to their own row. */}
      <div className="flex shrink-0 flex-col gap-1 whitespace-nowrap">
        {/* A polite live region: moving the day announces the new date. */}
        <p aria-live="polite" className="text-xs font-bold text-fg-muted">
          {showDesktop ? (
            <span className={cn(showCompact && "max-lg:hidden")}>{format.kicker(day)}</span>
          ) : null}
          {showCompact ? <span className={cn(showDesktop && "lg:hidden")}>{compactKicker}</span> : null}
        </p>
        <h1 className="type-h1 text-fg max-lg:text-[1.875rem] lg:type-display lg:[font-weight:500]">{t("title")}</h1>
      </div>

      {showDesktop ? (
        <div className={cn("ms-auto flex flex-wrap items-center gap-2", showCompact && "max-lg:hidden")}>
          <EnergySelector />
          <CapacityPill />
          <DayNav />
          <MyDayMoreMenu />
        </div>
      ) : null}
      {showCompact ? <CapacityPill compact className={cn(showDesktop && "lg:hidden")} /> : null}
    </header>
  );
}

/** The header's more menu: Daily shutdown (P10) is reachable from here, never from navigation. */
function MyDayMoreMenu() {
  const t = useTranslations("MyDay.header");
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={Ellipsis} label={t("more")} variant="ghost" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem icon={Moon} onSelect={() => router.push("/personal/shutdown")}>
          {t("shutdown")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
