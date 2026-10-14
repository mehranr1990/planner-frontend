"use client";

import { CalendarCheck, Moon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useId, useRef, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { Icon } from "@/components/ui/icon";
import { dayToDate, getPlannerToday } from "@/data/clock";
import { useTasks } from "@/data/queries";
import { getAppContext } from "@/features/navigation/contexts";
import type { NavItem, NavItemId } from "@/features/navigation/types";
import { useNavBadge, useNavItemFilter } from "@/features/navigation/use-nav-state";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import { usePreferences } from "@/features/preferences/use-preferences";
import { useOpenSheet } from "@/features/sheets/sheet-params";
import { formatDateParam } from "@/lib/dates/date-param";
import { formatDate } from "@/lib/dates/format";
import { getWeekDates } from "@/lib/dates/week";
import { formatNumber } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { NotificationsPopover } from "./notifications-popover";
import { ProfileMenu } from "./profile-menu";
import { ShellContextSwitcher } from "./shell-context-switcher";

/*
 * Personal mobile chrome (PM01): the header (account · Personal + name as the
 * context switcher · bell — no context chips, no digits toggle), the More sheet (module grid +
 * contextual flows) and the centre "+" (tap = Universal Quick Add,
 * long-press = Voice capture).
 */

/** The More grid, in PM01 order. Hidden modules drop out (P17). */
const MORE_ITEMS: readonly NavItemId[] = ["goals", "habits", "finance", "journal", "insights", "inbox", "braindump", "settings"];

export function PersonalMobileHeader() {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <ProfileMenu align="start" />
      {/* The identity is the mobile context switcher (Personal · Projects · Teams · Companies). */}
      <ShellContextSwitcher variant="header" />
      <NotificationsPopover triggerClassName="bg-surface shadow-island hover:bg-subtle" />
    </div>
  );
}

function MoreTile({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const t = useTranslations("Navigation");
  const tBadges = useTranslations("Navigation.badges");
  const badge = useNavBadge(item);
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-label={badge ? tBadges("withCount", { label: t(item.labelKey), count: badge.label }) : undefined}
        className="flex min-h-22 w-full flex-col items-center justify-center gap-1.5 rounded-tile px-1 py-3 text-center transition-colors hover:bg-subtle"
      >
        <span className="relative grid size-11 place-items-center rounded-full bg-subtle text-fg">
          <Icon icon={item.icon} size={20} />
          {badge ? (
            <span
              aria-hidden="true"
              data-slot="nav-badge"
              className="absolute -end-1 -top-1 inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-pill bg-primary px-1 text-[0.625rem] font-bold text-on-accent tabular ring-2 ring-elevated"
            >
              {badge.count}
            </span>
          ) : null}
        </span>
        <span className="max-w-full truncate text-xs font-semibold text-fg">
          {t(item.labelKey)}
        </span>
      </Link>
    </li>
  );
}

function FlowRow({
  href,
  icon,
  label,
  hint,
  onNavigate,
}: {
  href: string;
  icon: typeof Moon;
  label: string;
  hint?: string;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={href}
        onClick={onNavigate}
        className="flex min-h-12 w-full items-center gap-3 rounded-field bg-subtle px-3.5 text-start text-sm font-semibold text-fg transition-colors hover:bg-raised"
      >
        <Icon icon={icon} className="text-fg-secondary" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {hint ? <span className="shrink-0 text-xs font-medium text-fg-muted">{hint}</span> : null}
      </Link>
    </li>
  );
}

/** Body of the Personal More sheet: the module grid, then Finish day and Weekly review. */
export function PersonalMoreContent({ onNavigate }: { onNavigate: () => void }) {
  const t = useTranslations("Shell.more");
  const context = getAppContext("personal");
  const visible = useNavItemFilter(context);
  const settings = usePlannerSettings();
  const { locale, digits, calendar } = usePreferences();
  const today = dayToDate(getPlannerToday());
  const unfinished = useTasks({ view: "today", status: "open" }).data?.length;

  const items = MORE_ITEMS.map((id) => context.nav.find((item) => item.id === id)).filter(
    (item): item is NavItem => item !== undefined && visible(item),
  );
  const week = getWeekDates(today, settings.week);
  const reviewDay = week.find((day) => day.getDay() === settings.weeklyReview.weekday) ?? week[week.length - 1]!;

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label={t("modules")} className="grid grid-cols-4 gap-1">
        {items.map((item) => (
          <MoreTile key={item.id} item={item} onNavigate={onNavigate} />
        ))}
      </ul>
      <ul aria-label={t("flows")} className="flex flex-col gap-2">
        <FlowRow
          href="/personal/shutdown"
          icon={Moon}
          label={t("finishDay")}
          hint={unfinished ? t("unfinished", { count: formatNumber(unfinished, digits) }) : undefined}
          onNavigate={onNavigate}
        />
        <FlowRow
          href={`/personal/review/${formatDateParam(week[0]!)}`}
          icon={CalendarCheck}
          label={t("weeklyReview")}
          hint={formatDate(reviewDay, "weekday", { calendar, locale, digits })}
          onNavigate={onNavigate}
        />
      </ul>
      <p className="text-xs text-fg-muted">{t("hiddenNote")}</p>
    </div>
  );
}

const LONG_PRESS_MS = 500;

/**
 * Centre "+" behaviour: a tap opens Universal Quick Add, a long-press opens
 * Voice capture (PM01). The context-menu gesture (right click, the Menu key,
 * Shift+F10) is the keyboard and pointer alternative to the long-press.
 */
export function usePersonalFab() {
  const t = useTranslations("Shell.more");
  const openSheet = useOpenSheet();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const hintId = useId();

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const props = {
    "aria-describedby": hintId,
    "aria-haspopup": "dialog" as const,
    onPointerDown: (event: PointerEvent) => {
      if (event.button !== 0) return;
      longPressed.current = false;
      clear();
      timer.current = setTimeout(() => {
        longPressed.current = true;
        openSheet("voice");
      }, LONG_PRESS_MS);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: (event: MouseEvent) => {
      clear();
      if (longPressed.current) {
        event.preventDefault();
        longPressed.current = false;
        return;
      }
      openSheet("quick-add");
    },
    onContextMenu: (event: MouseEvent) => {
      event.preventDefault();
      clear();
      // A touch long-press already opened Voice (Android follows it with contextmenu).
      if (longPressed.current) return;
      openSheet("voice");
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        openSheet("voice");
      }
    },
  };

  const hint = (
    <span id={hintId} hidden>
      {t("voiceHint")}
    </span>
  );

  return { props, hint, className: cn("touch-none select-none") };
}
