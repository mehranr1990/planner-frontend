"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { OverloadBar } from "@/features/my-day/header/overload-bar";
import { NowCard } from "@/features/my-day/rail";
import { EmptyDayState } from "@/features/my-day/states/empty-day-state";
import { TimelineCard } from "@/features/my-day/timeline";
import type { MyDayState } from "@/fixtures/personal/my-day-states";
import { MyDayDemoStack } from "../../my-day/demo-data";
import { myDayDemoHref } from "../../my-day/demo-params";
import { DragPreview } from "../../my-day/drag-preview";
import { MountWhenVisible } from "../../my-day/mount-when-visible";
import { ReschedulePreview } from "../../my-day/reschedule-preview";
import { PreviewFrame } from "../../preview-frame";
import { StyleguideSection } from "../../styleguide-section";

/** Reschedule's tile and link: the "Client prep" block of the overloaded day (the board's example). */
const RESCHEDULE_BLOCK = "blk-t-od-client-prep";

interface TileProps {
  name: string;
  href: string;
  children: ReactNode;
}

/** One state of the P02 spec tab: a captioned frame and a link to the full-screen demo of the same state. */
function StateTile({ name, href, children }: TileProps) {
  const t = useTranslations("Styleguide.components.myDayStates");
  return (
    <PreviewFrame
      contentClassName="min-h-40 p-3 sm:p-4"
      label={
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span>{name}</span>
          <Link href={href} className="font-semibold text-scope-deep underline-offset-2 hover:underline">
            {t("openFull")}
          </Link>
        </span>
      }
    >
      <MountWhenVisible
        placeholder={
          <p role="status" className="py-12 text-center text-sm text-fg-muted">
            {t("placeholder")}
          </p>
        }
      >
        {children}
      </MountWhenVisible>
    </PreviewFrame>
  );
}

/**
 * P02 · My Day, spec tab "States": current and completed, empty day,
 * overloaded, partially planned, no current block (and after hours), drag and
 * Reschedule. Each tile owns an isolated mock store, so dragging, moving or
 * completing in one never changes another or the app's sample data. The same
 * states run full screen at /styleguide/my-day?state=… (see demo-params.ts).
 */
export function MyDayStatesSection() {
  const t = useTranslations("Styleguide.components.myDayStates");
  const timeline = (state: MyDayState, extra?: { footer?: ReactNode; emptyState?: ReactNode }) => (
    <MyDayDemoStack state={state}>
      <TimelineCard {...extra} />
    </MyDayDemoStack>
  );

  return (
    <StyleguideSection id="my-day-states" tier="signature" title={t("title")} description={t("description")}>
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <StateTile name={t("tiles.current")} href={myDayDemoHref("normal")}>
          {timeline("normal")}
        </StateTile>
        <StateTile name={t("tiles.empty")} href={myDayDemoHref("empty")}>
          {timeline("empty", { emptyState: <EmptyDayState /> })}
        </StateTile>
        <StateTile name={t("tiles.overloaded")} href={myDayDemoHref("overloaded")}>
          {timeline("overloaded", { footer: <OverloadBar /> })}
        </StateTile>
        <StateTile name={t("tiles.partial")} href={myDayDemoHref("partial")}>
          {timeline("partial")}
        </StateTile>
        <StateTile name={t("tiles.noCurrent")} href={myDayDemoHref("no-current")}>
          <MyDayDemoStack state="no-current">
            <NowCard />
          </MyDayDemoStack>
        </StateTile>
        <StateTile name={t("tiles.afterHours")} href={myDayDemoHref("after-hours")}>
          <MyDayDemoStack state="after-hours">
            <NowCard />
          </MyDayDemoStack>
        </StateTile>
        <StateTile name={t("tiles.drag")} href={myDayDemoHref("normal")}>
          <DragPreview />
        </StateTile>
        <StateTile name={t("tiles.reschedule")} href={myDayDemoHref("overloaded", RESCHEDULE_BLOCK)}>
          <MyDayDemoStack state="overloaded">
            <ReschedulePreview blockId={RESCHEDULE_BLOCK} />
          </MyDayDemoStack>
        </StateTile>
      </div>
    </StyleguideSection>
  );
}
