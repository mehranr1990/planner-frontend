"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { TodaySwitch } from "@/features/personal/today-switch";
import { cn } from "@/lib/cn";
import { MyDayHeader } from "./header/my-day-header";
import { OverloadBar } from "./header/overload-bar";
import { MyDayProvider, type MyDayProviderProps } from "./my-day-context";
import { FocusCard, NowCard, PrioritiesCard, UnscheduledCard, UnscheduledTray } from "./rail";
import { RescheduleHost } from "./reschedule/reschedule-host";
import { EmptyDayState } from "./states/empty-day-state";
import { MyDayDndProvider, TimelineCard } from "./timeline";

/*
 * P02 My Day. From lg: the header, then two columns (timeline | right rail:
 * Now, Focus, Priorities, Unscheduled). Exactly three Signature cards: the
 * Timeline, Now and Focus. Below lg it is the PM01 "Today · Plan" phone
 * screen, not a scaled-down desktop: header with the free-time chip, the
 * Overview ⇄ Plan switch, the overload row when needed, the timeline card
 * and the collapsed Unscheduled tray. Now, Focus and Priorities live in
 * Overview and the Focus route on a phone.
 *
 * Breakpoint-only differences are CSS (`lg:` / `max-lg:`); the pieces that
 * also change behaviour (timeline scale, drag side, popover vs sheet) read
 * the same lg query through useIsDesktop. The page mounts this inside a
 * <Suspense> because the provider follows ?date= and ?view= in the URL.
 */

/** What a demo harness may set; the production page passes nothing. */
export type MyDayDemoOptions = Pick<
  Extract<MyDayProviderProps, { syncUrl: false }>,
  "now" | "initialReschedule" | "initialSelectedBlockId" | "initialDay" | "initialView" | "initialEnergy"
>;

export interface MyDayScreenProps {
  /** Demo harness: keep day and view in memory instead of the URL, with these starting values. */
  demo?: MyDayDemoOptions;
  className?: string;
}

export function MyDayScreen({ demo, className }: MyDayScreenProps) {
  const body = <MyDayLayout className={className} />;
  return demo ? (
    <MyDayProvider syncUrl={false} {...demo}>
      {body}
    </MyDayProvider>
  ) : (
    <MyDayProvider>{body}</MyDayProvider>
  );
}

function MyDayLayout({ className }: { className?: string }) {
  const t = useTranslations("Personal.today");
  const [trayOpen, setTrayOpen] = useState(false);
  return (
    <MyDayDndProvider>
      <div
        data-screen="my-day"
        className={cn(
          "flex min-w-0 flex-col gap-4 lg:gap-5",
          // The phone page: viewport minus the chrome above the plan (top bar, title, switch) and below it (bottom nav).
          "[--my-day-plan-height:calc(100dvh-21.5rem-var(--safe-top)-var(--safe-bottom))]",
          className,
        )}
      >
        <MyDayHeader />
        <TodaySwitch current="myday" labels={{ nav: t("label"), overview: t("overview"), plan: t("plan") }} />
        {/* Phone: the overload read-out sits under the switch; desktop puts it in the timeline card. */}
        <OverloadBar className="lg:hidden" showSummary={false} />

        {/* Phone: the column is as tall as the space under the header, so the tray sits just above the bottom nav and the timeline scrolls inside. */}
        <div
          className={cn(
            "grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start lg:gap-4.5",
            // Open tray: the column grows with it (the page scrolls) while the timeline keeps a short grid.
            !trayOpen && "max-lg:h-(--my-day-plan-height) max-lg:min-h-[28rem]",
          )}
        >
          <div className="flex min-w-0 flex-col gap-4 max-lg:min-h-0">
            <TimelineCard
              className="max-lg:min-h-0 max-lg:flex-1"
              shrunk={trayOpen}
              footer={<OverloadBar className="max-lg:hidden" />}
              emptyState={<EmptyDayState />}
            />
            <UnscheduledTray className="lg:hidden" onExpandedChange={setTrayOpen} />
          </div>
          <div data-slot="my-day-rail" className="hidden min-w-0 flex-col gap-4.5 lg:flex">
            <NowCard />
            <FocusCard />
            <PrioritiesCard />
            <UnscheduledCard />
          </div>
        </div>
      </div>
      <RescheduleHost />
    </MyDayDndProvider>
  );
}
