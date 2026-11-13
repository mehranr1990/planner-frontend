"use client";

import { Check, Cog, Eye, MoreHorizontal, Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icon";
import type { Scope } from "@/design-system/tokens/colors";
import { usePreferences } from "@/features/preferences/use-preferences";
import { formatNumber } from "@/lib/locale/digits";
import { cn } from "@/lib/cn";
import { topCenterNotchPath } from "./people-workload";

/*
 * CaseFlow (shared, design/team/PEOPLE_FLOW.md §2). A read-only flow board:
 * it never decides anything. Context-neutral: accent via `scope`, meaning
 * from the caller (TM-02: team statuses, plan tasks, dependencies, Done this
 * week tiles).
 *
 * - Card radius 36 with a top-centre notch (height 88, 32px fillets) holding
 *   the people of this flow, each with a badge: number = open steps, red =
 *   something blocked / waiting / overdue, check = all done, + = no step
 *   (the + is a button: assign / filter by person).
 * - Stage columns in soft panels (radius 28), max 5 rows each, then "+N more"
 *   (opens the List, filtered). 48px gutters hold the connectors. Last block:
 *   a 2-column grid of outcome tiles (the highlighted one in the deep colour).
 *   Each column's label sits underneath.
 * - Rows (72px): avatar / round + (unassigned) / system icon · title (bold
 *   when current) + sub-line · state (check, dots, "Blocked" chip). A row
 *   opens the context's drawer.
 * - Connectors: curves from a row's end dot to a row's start dot; solid in
 *   the line colour = satisfied, dashed red = still waiting. aria-hidden:
 *   screen readers get the same links as text ("Needs …", "Needed by …").
 * - Phone: stacked stage cards, lines replaced by "→ Needed by …" captions.
 * - RTL: columns reverse through dir; the connector SVG is drawn in logical
 *   coordinates and mirrored with scaleX(-1).
 */

export type CaseFlowBadge =
  | { kind: "count"; n: number }
  | { kind: "alert"; n: number }
  | { kind: "done" }
  | { kind: "none" };

export interface CaseFlowPerson {
  id: string;
  name: string;
  initials: string;
  badge: CaseFlowBadge;
}

export interface CaseFlowRow {
  id: string;
  title: string;
  sub?: string;
  current?: boolean;
  state: "done" | "active" | "blocked" | "none";
  lead: { kind: "person"; name: string; initials: string } | { kind: "unassigned" } | { kind: "system" };
  href?: string;
}

export interface CaseFlowColumn {
  id: string;
  label: string;
  rows: readonly CaseFlowRow[];
  /** Placeholder when the column has no rows ("Nothing in review" · "tasks appear here when moved"). */
  empty?: { title: string; hint?: string };
  /** "+N more" target (the List, filtered). */
  moreHref?: string;
}

export interface CaseFlowLink {
  /** Upstream row (the one that must finish). */
  from: string;
  /** Downstream row (the one that waits). */
  to: string;
  satisfied: boolean;
}

export interface CaseFlowOutcome {
  id: string;
  title: string;
  meta?: string;
  highlighted?: boolean;
  href?: string;
}

export interface CaseFlowProps {
  title: ReactNode;
  scope: Scope;
  people: readonly CaseFlowPerson[];
  columns: readonly CaseFlowColumn[];
  links: readonly CaseFlowLink[];
  outcomes: readonly CaseFlowOutcome[];
  outcomeLabel: string;
  /** Round icon buttons at the header's end (Filter · Share · Open in calendar). */
  actions?: ReactNode;
  /** Avatar click = filter by person (toggle); the avatar becomes a pressed/unpressed button. */
  onPersonSelect?: (personId: string) => void;
  selectedPersonId?: string | null;
  /** The "+" badge: assign / filter by person. */
  onPersonAction?: (personId: string) => void;
  footnote?: ReactNode;
  maxRows?: number;
  className?: string;
}

const PERSON_SLOT = 48;
const NOTCH_HEIGHT = 88;
const NOTCH_FILLET = 32;
const CARD_RADIUS = 36;
const DESKTOP = "(min-width: 64rem)";

interface Segment {
  key: string;
  d: string;
  satisfied: boolean;
}

export function CaseFlow({
  title,
  scope,
  people,
  columns,
  links,
  outcomes,
  outcomeLabel,
  actions,
  onPersonAction,
  onPersonSelect,
  selectedPersonId = null,
  footnote,
  maxRows = 5,
  className,
}: CaseFlowProps) {
  const t = useTranslations("CaseFlow");
  const { digits } = usePreferences();
  const titleId = useId();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [segments, setSegments] = useState<{ width: number; height: number; items: Segment[] }>({
    width: 0,
    height: 0,
    items: [],
  });
  const notchWidth = Math.max(people.length, 1) * PERSON_SLOT + 24;

  const titles = new Map(columns.flatMap((column) => column.rows.map((row) => [row.id, row.title] as const)));
  const needs = (id: string) => links.filter((link) => link.to === id && titles.has(link.from)).map((link) => titles.get(link.from)!);
  const neededBy = (id: string) => links.filter((link) => link.from === id && titles.has(link.to)).map((link) => titles.get(link.to)!);
  const list = (items: string[]) => items.join(t("separator"));

  // Notch on desktop (the people sit over the canvas in the cut-out).
  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) return;
    const desktop = typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP) : null;
    const apply = () => {
      const { offsetWidth: width, offsetHeight: height } = element;
      if (desktop?.matches && width > notchWidth + 2 * (CARD_RADIUS + NOTCH_FILLET) && height > NOTCH_HEIGHT) {
        element.style.clipPath = `path("${topCenterNotchPath(width, height, notchWidth, {
          radius: CARD_RADIUS,
          notchHeight: NOTCH_HEIGHT,
          bottomRadius: 44,
          fillet: NOTCH_FILLET,
        })}")`;
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

  // Connectors in logical coordinates (inline-start = 0), mirrored for RTL by scaleX(-1).
  const measure = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    const box = board.getBoundingClientRect();
    const rtl = getComputedStyle(board).direction === "rtl";
    const logical = (x: number) => (rtl ? box.right - x : x - box.left);
    const rowBox = (id: string) => board.querySelector<HTMLElement>(`[data-flow-row="${CSS.escape(id)}"]`)?.getBoundingClientRect();
    const items: Segment[] = [];
    for (const link of links) {
      const from = rowBox(link.from);
      const to = rowBox(link.to);
      if (!from || !to || from.width === 0 || to.width === 0) continue;
      const start = (rect: DOMRect) => (rtl ? logical(rect.right) : logical(rect.left));
      const end = (rect: DOMRect) => (rtl ? logical(rect.left) : logical(rect.right));
      // Always run from the box nearer the inline start (a waiting row can sit before its upstream).
      const [a, b] = start(from) <= start(to) ? [from, to] : [to, from];
      const x1 = end(a);
      const y1 = a.top - box.top + a.height / 2;
      const x2 = start(b);
      const y2 = b.top - box.top + b.height / 2;
      const bend = Math.max(24, Math.abs(x2 - x1) / 2);
      const direction = x2 >= x1 ? 1 : -1;
      items.push({
        key: `${link.from}-${link.to}`,
        d: `M ${x1} ${y1} C ${x1 + bend * direction} ${y1}, ${x2 - bend * direction} ${y2}, ${x2} ${y2}`,
        satisfied: link.satisfied,
      });
    }
    // Callers rebuild `links` per render: only commit a geometry change (no measure ⇄ render loop).
    setSegments((previous) =>
      previous.width === box.width &&
      previous.height === box.height &&
      previous.items.length === items.length &&
      previous.items.every((item, index) => item.d === items[index]!.d && item.satisfied === items[index]!.satisfied)
        ? previous
        : { width: box.width, height: box.height, items },
    );
  }, [links]);

  useLayoutEffect(() => {
    measure();
    const board = boardRef.current;
    const observer = board && typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    if (board) observer?.observe(board);
    return () => observer?.disconnect();
  }, [measure, columns]);

  const badge = (person: CaseFlowPerson) => {
    const { badge: value } = person;
    if (value.kind === "none") {
      return (
        <button
          type="button"
          aria-label={t("badgeNone", { name: person.name })}
          onClick={() => onPersonAction?.(person.id)}
          className="-mt-2 inline-flex size-5 items-center justify-center rounded-full bg-surface text-fg-secondary ring-2 ring-surface hover:bg-subtle"
        >
          <Icon icon={Plus} size={12} />
        </button>
      );
    }
    const label =
      value.kind === "done"
        ? t("badgeDone", { name: person.name })
        : value.kind === "alert"
          ? t("badgeAlert", { name: person.name, n: formatNumber(value.n, digits) })
          : t("badgeOpen", { name: person.name, n: formatNumber(value.n, digits) });
    return (
      <span
        role="img"
        aria-label={label}
        data-badge={value.kind}
        className={cn(
          "-mt-2 inline-flex size-5 items-center justify-center rounded-full text-[0.625rem] font-bold text-on-accent ring-2 ring-surface",
          value.kind === "alert" ? "bg-danger" : value.kind === "done" ? "bg-success-text" : "bg-scope-dot",
        )}
      >
        {value.kind === "done" ? <Icon icon={Check} size={11} /> : formatNumber(value.n, digits)}
      </span>
    );
  };

  const rowLead = (row: CaseFlowRow) => {
    if (row.lead.kind === "person") {
      return <Avatar name={row.lead.name} initials={row.lead.initials} size={40} tone={scope} decorative />;
    }
    return (
      <span
        aria-hidden="true"
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-fg-secondary inset-ring inset-ring-line"
      >
        <Icon icon={row.lead.kind === "system" ? Cog : Plus} size={16} />
      </span>
    );
  };

  const rowState = (row: CaseFlowRow) => {
    if (row.state === "done")
      return (
        <span className="shrink-0 text-fg-secondary">
          <Icon icon={Check} size={16} />
          <span className="sr-only">{t("done")}</span>
        </span>
      );
    if (row.state === "blocked")
      return (
        <span className="shrink-0 rounded-pill bg-danger-soft px-2 py-0.5 text-xs font-semibold text-danger-text">
          {t("blocked")}
        </span>
      );
    if (row.state === "active")
      return (
        <span className="shrink-0 text-fg-secondary">
          <Icon icon={MoreHorizontal} size={16} />
          <span className="sr-only">{t("active")}</span>
        </span>
      );
    return null;
  };

  return (
    <section aria-labelledby={titleId} data-scope={scope} data-slot="case-flow" className={cn("relative min-w-0", className)}>
      <div ref={surfaceRef} aria-hidden="true" className="absolute inset-0 rounded-[2.25rem] bg-surface" />
      <div className="relative flex flex-col gap-5 p-5 lg:p-6">
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 lg:min-h-16">
          <h2 id={titleId} className="type-title text-fg">
            {title}
          </h2>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>

        <ul
          aria-label={t("people")}
          style={{ "--notch-w": `${notchWidth}px` } as CSSProperties}
          className="flex items-start max-lg:-mx-1 max-lg:overflow-x-auto max-lg:px-1 lg:absolute lg:inset-x-0 lg:top-0 lg:mx-auto lg:w-(--notch-w) lg:justify-center lg:pt-3"
        >
          {people.map((person) => (
            <li key={person.id} className="flex w-12 shrink-0 flex-col items-center">
              {onPersonSelect ? (
                <button
                  type="button"
                  aria-pressed={selectedPersonId === person.id}
                  aria-label={t("filterPerson", { name: person.name })}
                  onClick={() => onPersonSelect(person.id)}
                  className={cn(
                    "rounded-full focus-visible:focus-ring",
                    selectedPersonId === person.id ? "ring-2 ring-scope-deep" : undefined,
                  )}
                >
                  <Avatar name={person.name} initials={person.initials} size={40} tone={scope} decorative className="ring-2 ring-surface" />
                </button>
              ) : (
                <Avatar name={person.name} initials={person.initials} size={40} tone={scope} decorative className="ring-2 ring-surface" />
              )}
              {badge(person)}
            </li>
          ))}
        </ul>

        <div ref={boardRef} className="relative grid gap-4 lg:grid-cols-[repeat(var(--flow-cols),minmax(0,1fr))_minmax(0,1.1fr)] lg:gap-12" style={{ "--flow-cols": columns.length } as CSSProperties}>
          {columns.map((column) => {
            const shown = column.rows.slice(0, maxRows);
            const extra = column.rows.length - shown.length;
            return (
              <div key={column.id} className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-col gap-1 rounded-[1.75rem] bg-subtle p-3 max-lg:bg-surface max-lg:inset-ring max-lg:inset-ring-line lg:min-h-64">
                  <h3 className="px-1 pb-1 text-sm font-bold text-fg lg:sr-only">{column.label}</h3>
                  {shown.length === 0 && column.empty ? (
                    <p className="flex min-h-18 items-center gap-3 px-2 py-2">
                      <span
                        aria-hidden="true"
                        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-fg-secondary inset-ring inset-ring-line"
                      >
                        <Icon icon={Eye} size={16} />
                      </span>
                      <span className="flex min-w-0 flex-col leading-snug">
                        <span className="text-sm font-medium text-fg-secondary">{column.empty.title}</span>
                        {column.empty.hint ? <span className="text-xs text-fg-secondary">{column.empty.hint}</span> : null}
                      </span>
                    </p>
                  ) : null}
                  <ul className="flex flex-col gap-1">
                    {shown.map((row) => {
                      const waitingFor = needs(row.id);
                      const blocking = neededBy(row.id);
                      const content = (
                        <>
                          {rowLead(row)}
                          <span className="flex min-w-0 flex-1 flex-col leading-snug">
                            <bdi className={cn("text-sm text-fg", row.current ? "font-bold" : "font-medium")}>{row.title}</bdi>
                            {row.sub ? <span className="truncate text-xs text-fg-secondary">{row.sub}</span> : null}
                            {waitingFor.length > 0 ? (
                              <span className="sr-only">{t("needs", { titles: list(waitingFor) })}</span>
                            ) : null}
                            {blocking.length > 0 ? (
                              <span className="text-xs text-fg-secondary lg:sr-only">{t("neededBy", { titles: list(blocking) })}</span>
                            ) : null}
                          </span>
                          {rowState(row)}
                        </>
                      );
                      return (
                        <li key={row.id}>
                          {row.href ? (
                            <Link
                              href={row.href}
                              data-flow-row={row.id}
                              className="flex min-h-18 items-center gap-3 rounded-row px-2 py-2 transition-colors hover:bg-surface"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div data-flow-row={row.id} className="flex min-h-18 items-center gap-3 rounded-row px-2 py-2">
                              {content}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {extra > 0 ? (
                    <Link href={column.moreHref ?? "#"} className="px-2 py-1 text-xs font-bold text-scope-deep hover:underline">
                      {t("more", { n: formatNumber(extra, digits) })}
                    </Link>
                  ) : null}
                </div>
                <p aria-hidden="true" className="text-center text-xs font-bold text-fg max-lg:hidden">
                  {column.label}
                </p>
              </div>
            );
          })}
          <div className="flex min-w-0 flex-col gap-2">
            <h3 className="px-1 text-sm font-bold text-fg lg:sr-only">{outcomeLabel}</h3>
            <ul className="grid grid-cols-2 gap-3">
              {outcomes.map((outcome) => {
                const body = (
                  <>
                    <bdi className="text-sm font-bold">{outcome.title}</bdi>
                    {outcome.meta ? <span className={cn("text-xs", outcome.highlighted ? "text-on-accent/80" : "text-fg-secondary")}>{outcome.meta}</span> : null}
                  </>
                );
                const tile = cn(
                  "flex min-h-28 flex-col justify-between gap-2 rounded-[1.25rem] p-3",
                  outcome.highlighted ? "bg-scope-deep text-on-accent" : "bg-surface text-fg inset-ring inset-ring-line",
                );
                return (
                  <li key={outcome.id}>
                    {outcome.href ? (
                      <Link href={outcome.href} data-flow-row={outcome.id} className={tile}>
                        {body}
                      </Link>
                    ) : (
                      <div data-flow-row={outcome.id} className={tile}>
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <p aria-hidden="true" className="text-center text-xs font-bold text-fg max-lg:hidden">
              {outcomeLabel}
            </p>
          </div>

          {segments.items.length > 0 ? (
            <svg
              aria-hidden="true"
              data-slot="flow-connectors"
              width={segments.width}
              height={segments.height}
              viewBox={`0 0 ${segments.width} ${segments.height}`}
              className="pointer-events-none absolute inset-0 max-lg:hidden rtl:-scale-x-100"
            >
              {segments.items.map((segment) => (
                <path
                  key={segment.key}
                  d={segment.d}
                  fill="none"
                  strokeWidth={1.5}
                  className={segment.satisfied ? "stroke-scope-dot" : "stroke-danger"}
                  strokeDasharray={segment.satisfied ? undefined : "3 4"}
                  data-satisfied={segment.satisfied}
                />
              ))}
            </svg>
          ) : null}
        </div>
        {footnote ? <p className="text-xs text-fg-secondary">{footnote}</p> : null}
      </div>
    </section>
  );
}
