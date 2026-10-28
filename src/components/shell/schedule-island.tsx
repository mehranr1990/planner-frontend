"use client";

import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { Avatar, type AvatarTone } from "@/components/ui/avatar";
import type { Scope } from "@/design-system/tokens/colors";
import { FocusIslandChip } from "@/features/focus/focus-running";
import { usePreferences } from "@/features/preferences/use-preferences";
import { cn } from "@/lib/cn";
import { formatDate, formatTime } from "@/lib/dates/format";
import { APP_TIME_ZONE, toZonedTime } from "@/lib/dates/zone";
import {
  deriveScheduleBlocks,
  visibleScheduleBlocks,
  type DerivedScheduleBlock,
  type ScheduleBlock,
} from "./schedule";
import { shellIslandClassName } from "./shell-island";

/*
 * Top-bar schedule island (CommandBar direction A): "Today" + date, a grey
 * track, the last finished block hatched, the current block lifted in white
 * with its elapsed share filled from inline-start and the volt now-dot, then
 * upcoming blocks tinted by scope. Presentation only: no calendar logic.
 * Narrow tracks drop blocks through container queries (current stays).
 *
 * Time zones: every instant is shown as the planner's wall clock
 * (APP_TIME_ZONE) through toZonedTime, so the server render and the browser
 * agree whatever zone either runs in. Times use the compact 24-hour form of
 * the boards ("14:00 – 16:00") in both languages, digits per preference.
 */

const upcomingTone: Record<Scope, string> = {
  personal: "bg-personal-soft text-personal-deep",
  project: "bg-project-soft text-project-deep",
  team: "bg-team-soft text-team-deep",
  company: "bg-company-soft text-company-deep",
};

const avatarTones: readonly AvatarTone[] = ["team", "personal", "project", "company"];

// Later upcoming blocks need progressively wider tracks.
const upcomingVisibility = ["hidden @2xs:flex", "hidden @xl:flex", "hidden @2xl:flex"] as const;

export interface ScheduleIslandProps {
  date: Date;
  now: Date;
  blocks: readonly ScheduleBlock[];
  /** Accessible name; defaults to "Today's schedule". */
  label?: string;
  /** Marks the content as sample data with a small visible tag (Common.sample). */
  sample?: boolean;
  className?: string;
}

export function ScheduleIsland({ date, now, blocks, label, sample = false, className }: ScheduleIslandProps) {
  const t = useTranslations("Shell");
  const tCommon = useTranslations("Common");
  const { locale, digits, calendar } = usePreferences();
  const time = (value: Date) => formatTime(value, { locale, digits, hourCycle: "h23" });

  // Wall-clock copies for status, elapsed share and formatting; the original
  // instants stay available for the machine-readable <time dateTime> values.
  const zonedDate = toZonedTime(date, APP_TIME_ZONE);
  const zonedNow = toZonedTime(now, APP_TIME_ZONE);
  const instants = new Map(blocks.map((block) => [block.id, block.start]));
  const zonedBlocks = blocks.map((block) => ({
    ...block,
    start: toZonedTime(block.start, APP_TIME_ZONE),
    end: toZonedTime(block.end, APP_TIME_ZONE),
  }));
  const visible = visibleScheduleBlocks(deriveScheduleBlocks(zonedBlocks, zonedNow));
  const upcoming = visible.filter((block) => block.status === "upcoming");

  const renderBlock = (block: DerivedScheduleBlock) => {
    if (block.status === "done") {
      return (
        <li
          key={block.id}
          data-status="done"
          className={cn(
            "hidden h-9 min-w-0 flex-[1_1_0] items-center rounded-pill px-3 @lg:flex",
            "bg-[repeating-linear-gradient(135deg,var(--hairline)_0_2px,transparent_2px_6px)]",
            "text-xs font-semibold text-fg-muted",
          )}
        >
          <span className="truncate">
            {block.title} · {t("done")}
          </span>
        </li>
      );
    }

    if (block.status === "current") {
      return (
        <li key={block.id} data-status="current" aria-current="time" className="relative flex h-10 min-w-0 flex-[2.4_1_0]">
          <div className="relative flex size-full min-w-0 items-center gap-2 overflow-hidden rounded-pill bg-surface ps-0.5 pe-3 shadow-island">
            <span
              aria-hidden="true"
              data-slot="elapsed"
              className="absolute inset-y-0 start-0 bg-scope-soft"
              // Dynamic geometry: the elapsed share is data.
              style={{ width: `${block.elapsed}%` }}
            />
            {/* The now line sits under the text layer; the title halo keeps it legible. */}
            <span
              aria-hidden="true"
              data-slot="now-line"
              className="pointer-events-none absolute inset-y-0.5 -ms-px w-0.5 rounded-pill bg-scope-deep"
              style={{ insetInlineStart: `${block.elapsed}%` }}
            />
            {block.people?.length ? (
              <span className="relative flex shrink-0">
                {block.people.map((person, index) => (
                  <Avatar
                    key={person}
                    name={person}
                    size={32}
                    tone={avatarTones[index % avatarTones.length]}
                    className={cn("ring-2 ring-surface", index > 0 && "-ms-2")}
                  />
                ))}
              </span>
            ) : null}
            {/*
              Title first: a wrapping row clipped to one line, so the time
              range drops to the hidden second line as soon as it would
              squeeze the title; the title truncates only when it cannot fit
              on its own.
            */}
            <span
              data-slot="current-text"
              className={cn(
                "relative flex h-5 min-w-0 flex-1 flex-wrap items-center gap-x-2 overflow-hidden",
                !block.people?.length && "ps-2.5",
              )}
            >
              <span className="max-w-full min-w-0 truncate text-sm font-bold [text-shadow:0_0_3px_var(--surface),0_0_3px_var(--surface)]">
                {block.title}
              </span>
              <span data-slot="range" className="ms-auto shrink-0 text-xs font-semibold text-fg-muted tabular">
                {t("timeRange", { start: time(block.start), end: time(block.end) })}
              </span>
            </span>
            <span className="sr-only">{t("now", { time: time(zonedNow) })}</span>
          </div>
          <span
            aria-hidden="true"
            data-slot="now-marker"
            className="pointer-events-none absolute top-0.5 -ms-px w-0.5"
            style={{ insetInlineStart: `${block.elapsed}%` }}
          >
            <span className="absolute -top-1.5 start-1/2 -ms-1.25 size-2.5 rounded-full bg-volt ring-2 ring-scope-deep" />
          </span>
        </li>
      );
    }

    const order = Math.min(upcoming.indexOf(block), upcomingVisibility.length - 1);
    return (
      <li
        key={block.id}
        data-status="upcoming"
        className={cn(
          "h-8 min-w-0 flex-[1.2_1_0] items-center rounded-pill px-3 text-xs font-bold",
          upcomingTone[block.scope],
          upcomingVisibility[order],
        )}
      >
        <span className="truncate">
          <time dateTime={(instants.get(block.id) ?? block.start).toISOString()} className="tabular">
            {time(block.start)}
          </time>{" "}
          · {block.title}
        </span>
      </li>
    );
  };

  return (
    <section
      aria-label={label ?? t("schedule")}
      className={cn(shellIslandClassName, "relative min-w-0 shrink gap-3 ps-4.5", className)}
    >
      {sample ? (
        // A tag on the island's top edge: marks the content without taking track width.
        <span
          data-slot="sample"
          className="pointer-events-none absolute -top-2 start-4 rounded-pill border border-hairline bg-surface px-1.5 text-[0.625rem] leading-3.5 font-semibold whitespace-nowrap text-fg-muted"
        >
          {tCommon("sample")}
        </span>
      ) : null}
      <p className="flex shrink-0 flex-col leading-tight">
        <span className="text-xs font-semibold text-fg-muted">{t("today")}</span>
        <time dateTime={format(zonedDate, "yyyy-MM-dd")} className="text-sm font-bold whitespace-nowrap">
          {formatDate(zonedDate, "dayMonth", { calendar, locale, digits })}
        </time>
      </p>
      <ol className="@container flex h-12 min-w-0 flex-1 items-center gap-1.5 rounded-pill bg-raised px-1">
        {visible.map(renderBlock)}
      </ol>
      {/* A live Focus session keeps its timer here after Leave focus (P09). */}
      <FocusIslandChip />
    </section>
  );
}
