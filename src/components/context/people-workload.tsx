"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { Avatar, type AvatarTone } from "@/components/ui/avatar";
import type { Scope } from "@/design-system/tokens/colors";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber, formatPercent } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { PresenceDot, type ManualStatus } from "./presence-dot";

/*
 * PeopleWorkload (shared, design/team/PEOPLE_FLOW.md §1). Context-neutral: the
 * accent comes from `scope` (data-scope tokens), copy for statuses from the
 * caller. Used by TM-01 (full), TM-08 (strip), later CO-03 / SO-19.
 *
 * - Product card (radius 32) with a top-centre notch (height 84, bottom radius
 *   42, 30px fillets) cut by clip-path; the notch holds the avatar picker, so
 *   it is never empty. Width = avatars × 58 + 24, max 8 avatars, then "+N".
 * - Avatar picker: role="radiogroup", A–Z (never a ranking), each a radio
 *   named "Name, status"; selected = 3px deep ring; presence dot under each.
 * - Selected-person strip: avatar · name, role · status + note · NOW WORKING
 *   ON (only when the person shares it, else "Not shared") · this-week booked
 *   bar · action (Message / Set status for yourself — rendered by the caller).
 * - Rows: avatar + dot, name, role, booked bar (over 100% = red overflow
 *   segment) and %. Status-only mode replaces the bar with status text.
 * - Phone: the notch row becomes a horizontal scroll row; strip stacks; rows
 *   become a list. RTL: notch stays centred, order mirrors via dir, bars fill
 *   from the start side.
 */

export interface PeopleWorkloadPerson {
  id: string;
  name: string;
  initials: string;
  /** Job title / role line (user content). */
  role: string;
  status: ManualStatus | null;
  note?: string;
  /** What they work on — only when shared; null = "Not shared"; undefined = block hidden (Social). */
  workingOn?: string | null;
  /** Booked % this week; null when the viewer may not see booking. */
  bookedPercent: number | null;
  isSelf?: boolean;
}

export interface PeopleWorkloadProps {
  title: ReactNode;
  people: readonly PeopleWorkloadPerson[];
  scope: Scope;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  statusLabel: (status: ManualStatus | null) => string;
  /** Statuses shown in the legend (only those used in this context). */
  legend: readonly ManualStatus[];
  /** "full" = strip + rows (TM-01); "strip" = rows hidden (TM-08). */
  mode?: "full" | "strip";
  /** Status-only mode (roles without workload rights, Social): no bars. */
  statusOnly?: boolean;
  /** The strip's action for the selected person (Message, or Set status for yourself). */
  action?: (person: PeopleWorkloadPerson) => ReactNode;
  /** "+N" past 8 avatars: opens the full list (e.g. People). */
  moreHref?: string;
  footnote?: ReactNode;
  className?: string;
}

const MAX_AVATARS = 8;
const AVATAR_SLOT = 58;
const NOTCH_HEIGHT = 84;
const NOTCH_RADIUS = 42;
const NOTCH_FILLET = 30;
const CARD_RADIUS = 32;

/** The card outline with a top-centre notch (symmetric, so RTL needs no mirroring). */
export function topCenterNotchPath(
  width: number,
  height: number,
  notchWidth: number,
  { radius = CARD_RADIUS, notchHeight = NOTCH_HEIGHT, bottomRadius = NOTCH_RADIUS, fillet = NOTCH_FILLET } = {},
): string {
  const left = (width - notchWidth) / 2;
  const right = left + notchWidth;
  const r = Math.min(bottomRadius, notchWidth / 2, notchHeight - fillet);
  return [
    `M ${radius} 0`,
    `L ${left - fillet} 0`,
    `A ${fillet} ${fillet} 0 0 1 ${left} ${fillet}`,
    `L ${left} ${notchHeight - r}`,
    `A ${r} ${r} 0 0 0 ${left + r} ${notchHeight}`,
    `L ${right - r} ${notchHeight}`,
    `A ${r} ${r} 0 0 0 ${right} ${notchHeight - r}`,
    `L ${right} ${fillet}`,
    `A ${fillet} ${fillet} 0 0 1 ${right + fillet} 0`,
    `L ${width - radius} 0`,
    `A ${radius} ${radius} 0 0 1 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `A ${radius} ${radius} 0 0 1 ${width - radius} ${height}`,
    `L ${radius} ${height}`,
    `A ${radius} ${radius} 0 0 1 0 ${height - radius}`,
    `L 0 ${radius}`,
    `A ${radius} ${radius} 0 0 1 ${radius} 0 Z`,
  ].join(" ");
}

const DESKTOP = "(min-width: 64rem)";

export function PeopleWorkload({
  title,
  people,
  scope,
  selectedId,
  onSelect,
  statusLabel,
  legend,
  mode = "full",
  statusOnly = false,
  action,
  moreHref,
  footnote,
  className,
}: PeopleWorkloadProps) {
  const t = useTranslations("PeopleWorkload");
  const { digits } = usePreferences();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const sorted = [...people].sort((a, b) => a.name.localeCompare(b.name));
  const shown = sorted.slice(0, MAX_AVATARS);
  const extra = sorted.length - shown.length;
  const notchWidth = (shown.length + (extra > 0 ? 1 : 0)) * AVATAR_SLOT + 24;
  const selected = sorted.find((person) => person.id === selectedId) ?? sorted[0];

  // Clip the notch from the surface on desktop (phones: plain card + scroll row).
  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const desktop = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP) : null;
    const apply = () => {
      const { offsetWidth: width, offsetHeight: height } = element;
      if (desktop?.matches && width > notchWidth + 2 * (CARD_RADIUS + NOTCH_FILLET) && height > NOTCH_HEIGHT) {
        element.style.clipPath = `path("${topCenterNotchPath(width, height, notchWidth)}")`;
        element.dataset.notch = "path";
      } else {
        element.style.clipPath = "";
        delete element.dataset.notch;
      }
    };
    apply();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(apply) : null;
    observer?.observe(element);
    desktop?.addEventListener?.("change", apply);
    return () => {
      observer?.disconnect();
      desktop?.removeEventListener?.("change", apply);
    };
  }, [notchWidth]);

  const percent = (value: number) => formatPercent(value / 100, digits);
  const tone: AvatarTone = scope;

  const onPickerKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key) || shown.length === 0) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const index = Math.max(0, shown.findIndex((person) => person.id === selected?.id));
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = shown.length - 1;
    else {
      const forward = event.key === "ArrowDown" || event.key === (rtl ? "ArrowLeft" : "ArrowRight");
      next = (index + (forward ? 1 : -1) + shown.length) % shown.length;
    }
    onSelect(shown[next]!.id);
    event.currentTarget.querySelector<HTMLElement>(`[data-person="${shown[next]!.id}"]`)?.focus();
  };

  const picker = (
    <div
      role="radiogroup"
      aria-labelledby={titleId}
      onKeyDown={onPickerKey}
      style={{ "--notch-w": `${notchWidth}px` } as CSSProperties}
      className="flex items-start max-lg:-mx-1 max-lg:overflow-x-auto max-lg:px-1 max-lg:pb-1 lg:absolute lg:inset-x-0 lg:top-0 lg:mx-auto lg:w-(--notch-w) lg:justify-center lg:pt-2"
    >
      {shown.map((person) => {
        const checked = person.id === selected?.id;
        return (
          <button
            key={person.id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-person={person.id}
            aria-label={`${person.name}, ${statusLabel(person.status)}`}
            onClick={() => onSelect(person.id)}
            className="flex w-14.5 shrink-0 flex-col items-center gap-1 rounded-pill py-1 outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <Avatar
              name={person.name}
              initials={person.initials}
              size={48}
              tone={tone}
              decorative
              className={cn(
                "ring-[3px]",
                checked ? "ring-scope-deep" : "ring-surface",
              )}
            />
            <PresenceDot status={person.status} />
          </button>
        );
      })}
      {extra > 0 ? (
        <Link
          href={moreHref ?? "#"}
          aria-label={t("moreLabel", { n: formatNumber(extra, digits) })}
          className="flex w-14.5 shrink-0 flex-col items-center gap-1 py-1"
        >
          <span className="inline-flex size-12 items-center justify-center rounded-pill bg-raised text-sm font-bold text-fg-secondary">
            {t("more", { n: formatNumber(extra, digits) })}
          </span>
        </Link>
      ) : null}
    </div>
  );

  const bar = (value: number, label: string, size: "sm" | "md" = "sm") => {
    const over = value > 100;
    return (
      <span
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}
        aria-valuetext={percent(value)}
        className={cn("relative flex w-full overflow-hidden rounded-pill bg-subtle", size === "sm" ? "h-2" : "h-2.5")}
      >
        <span
          className="h-full rounded-pill bg-scope-dot"
          style={{ inlineSize: `${Math.min(value, 100) - (over ? 3 : 0)}%` }}
        />
        {over ? <span data-overflow="" className="ms-0.5 h-full w-[3%] rounded-pill bg-danger" /> : null}
      </span>
    );
  };

  return (
    <section
      aria-labelledby={titleId}
      data-scope={scope}
      data-slot="people-workload"
      className={cn("relative min-w-0", className)}
    >
      {/* The surface is a clipped background layer, so the picker can sit in the notch over the canvas. */}
      <div ref={surfaceRef} aria-hidden="true" className="absolute inset-0 rounded-[2rem] bg-surface" />
      <div className="relative flex flex-col gap-4 p-5 text-fg lg:p-6">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 lg:min-h-15">
          <h2 id={titleId} className="type-title text-fg">
            {title}
          </h2>
          <ul aria-label={t("legend")} className="flex flex-wrap items-center gap-3 text-xs font-medium text-fg-secondary">
            {legend.map((status) => (
              <li key={status} className="flex items-center gap-1.5">
                <PresenceDot status={status} />
                {statusLabel(status)}
              </li>
            ))}
          </ul>
        </div>
        {picker}

        {selected ? (
          <div
            data-slot="selected-person"
            className="flex flex-col gap-3 rounded-[1.375rem] bg-scope-soft p-4 lg:flex-row lg:items-center lg:gap-6"
          >
            <div className="flex min-w-0 items-center gap-3 lg:w-60">
              <Avatar name={selected.name} initials={selected.initials} size={48} tone={tone} decorative className="bg-surface" />
              <div className="flex min-w-0 flex-col leading-snug">
                <bdi className="truncate text-base font-bold text-fg">{selected.name}</bdi>
                <span className="truncate text-xs font-semibold text-scope-deep">
                  <bdi>{selected.role}</bdi> · {statusLabel(selected.status)}
                  {selected.note ? (
                    <>
                      {" · "}
                      <bdi dir="auto">{selected.note}</bdi>
                    </>
                  ) : null}
                </span>
              </div>
            </div>
            {selected.workingOn !== undefined ? (
              <div className="flex min-w-0 flex-col leading-snug lg:w-56">
                <span className="text-[0.6875rem] font-bold tracking-wide text-scope-deep uppercase">{t("nowWorkingOn")}</span>
                <bdi dir="auto" className={cn("truncate text-sm font-semibold", selected.workingOn ? "text-fg" : "text-fg-muted")}>
                  {selected.workingOn ?? t("notShared")}
                </bdi>
              </div>
            ) : null}
            {!statusOnly && selected.bookedPercent !== null ? (
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[0.6875rem] font-bold tracking-wide text-scope-deep uppercase">
                  {t("thisWeek", { percent: percent(selected.bookedPercent) })}
                </span>
                {bar(selected.bookedPercent, t("bookedOf", { name: selected.name }), "md")}
              </div>
            ) : (
              <span className="flex-1" />
            )}
            {action ? <div className="shrink-0">{action(selected)}</div> : null}
          </div>
        ) : null}

        {mode === "full" ? (
          <ul aria-label={t("rows")} className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((person) => (
              <li key={person.id} className="flex min-w-0 items-center gap-3">
                <span className="relative shrink-0">
                  <Avatar name={person.name} initials={person.initials} size={40} tone={tone} decorative />
                  <PresenceDot status={person.status} className="absolute end-0 bottom-0 ring-2 ring-surface" />
                </span>
                <span className="flex min-w-0 flex-col leading-snug lg:w-28">
                  <bdi className="truncate text-sm font-bold text-fg">{person.name}</bdi>
                  <span className="truncate text-xs text-fg-secondary">
                    {statusOnly || person.bookedPercent === null ? (
                      statusLabel(person.status)
                    ) : (
                      <>
                        <bdi>{person.role}</bdi>
                        <span className="sr-only">, {statusLabel(person.status)}</span>
                      </>
                    )}
                  </span>
                </span>
                {!statusOnly && person.bookedPercent !== null ? (
                  <>
                    <span className="flex min-w-0 flex-1 items-center">
                      {bar(person.bookedPercent, t("bookedOf", { name: person.name }))}
                    </span>
                    <span
                      className={cn(
                        "w-11 shrink-0 text-end text-xs font-bold tabular",
                        person.bookedPercent > 100 ? "text-danger-text" : "text-fg",
                      )}
                    >
                      {percent(person.bookedPercent)}
                    </span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {footnote ? <p className="text-xs text-fg-secondary">{footnote}</p> : null}
      </div>
    </section>
  );
}
