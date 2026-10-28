"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getPlannerNow, getPlannerToday } from "@/data/clock";
import type { EnergyLevel } from "@/data/domain";
import type { UnscheduledRange } from "@/data/repositories";
import { usePlannerSettings } from "@/features/planner-settings/use-planner-settings";
import type { RescheduleOptionId } from "./domain/reschedule";
import { addDaysToDay, dayOfInstant, dayToLocalDate, localDateToDay, minutesOfInstant } from "@/lib/dates/clock-time";
import { formatDateParam, parseDateParam } from "@/lib/dates/date-param";

/*
 * UI state of the My Day screen: which day and view, the energy filter, the
 * selected block, the Unscheduled pill and the open Reschedule popover.
 * Server data lives in the repositories; this holds only what the person is
 * looking at.
 *
 * `?date=` (Jalali, Latin digits, see date-param.ts) and `?view=3days` are
 * mirrored to the URL with router.replace, other params (?sheet=…) are kept.
 * The URL stays the source of truth for links and back/forward: the local
 * state follows it whenever it changes, and updates instantly when the
 * person acts. The URL-synced provider reads useSearchParams(), so mount it
 * inside <Suspense>. Demo harnesses pass `syncUrl={false}`.
 */

export const DATE_PARAM = "date";
export const VIEW_PARAM = "view";

export type MyDayView = "day" | "3days";

/** What a Reschedule request moves: one block, one task, or several blocks at once ("Move 2 to tomorrow"). */
export type RescheduleTarget =
  | { kind: "block"; id: string }
  | { kind: "task"; id: string }
  | { kind: "blocks"; ids: readonly string[] };

/** Which Reschedule row starts selected. */
export type ReschedulePreselect = RescheduleOptionId;

export interface RescheduleOpenOptions {
  /** Pointer position for a right-click: the popover anchors to this point when there is no element. */
  point?: { x: number; y: number };
  /** The row to start on; default the first offered. */
  preselect?: ReschedulePreselect;
}

export interface RescheduleRequest extends RescheduleOpenOptions {
  target: RescheduleTarget;
  /** The control that opened it (popover anchor on desktop); null for a sheet or keyboard shortcut. */
  anchor: HTMLElement | null;
}

export interface MyDayContextValue {
  /** The day on screen, "YYYY-MM-DD". */
  day: string;
  /** The planner's today. */
  today: string;
  /** Live treatments (now line, Now card) render only when this is true. */
  isToday: boolean;
  view: MyDayView;
  energy: EnergyLevel;
  selectedBlockId: string | null;
  /** The Unscheduled card's pill. */
  filter: UnscheduledRange;
  reschedule: RescheduleRequest | null;

  setDay(day: string): void;
  /** Moves the day by whole days (the prev / next buttons: ±1). */
  shiftDay(delta: number): void;
  goToToday(): void;
  setView(view: MyDayView): void;
  setEnergy(energy: EnergyLevel): void;
  selectBlock(id: string | null): void;
  setFilter(filter: UnscheduledRange): void;
  openReschedule(target: RescheduleTarget, anchor?: HTMLElement | null, options?: RescheduleOpenOptions): void;
  closeReschedule(): void;
}

const MyDayContext = createContext<MyDayContextValue | null>(null);

export function useMyDay(): MyDayContextValue {
  const value = useContext(MyDayContext);
  if (!value) throw new Error("useMyDay must be used inside <MyDayProvider>.");
  return value;
}

/** The planner's now. The only clock the screen reads. */
export interface PlannerNow {
  /** ISO instant with offset. */
  instant: string;
  /** The planner's today, "YYYY-MM-DD". */
  day: string;
  /** Minutes after midnight. */
  minutes: number;
}

/** A demo harness's clock (see MyDayProvider's `now`); null means the planner clock. */
const PlannerNowContext = createContext<string | null>(null);

export function usePlannerNow(): PlannerNow {
  const override = useContext(PlannerNowContext);
  return useMemo(() => {
    if (override) return { instant: override, day: dayOfInstant(override), minutes: minutesOfInstant(override) };
    const instant = getPlannerNow();
    return { instant, day: getPlannerToday(), minutes: minutesOfInstant(instant) };
  }, [override]);
}

// ── URL ↔ state ──────────────────────────────────────────────────────────

/** The day of a `?date=` value, or `fallback` when it is missing or not a real day. */
export function dayFromParam(value: string | null, fallback: string): string {
  const date = parseDateParam(value);
  return date ? localDateToDay(date) : fallback;
}

export function viewFromParam(value: string | null): MyDayView {
  return value === "3days" ? "3days" : "day";
}

/** `search` with the day and view applied: today and "day" are the defaults and leave no param. */
export function searchWithDayView(search: string, day: string, view: MyDayView, today: string): string {
  const params = new URLSearchParams(search);
  if (day === today) params.delete(DATE_PARAM);
  else params.set(DATE_PARAM, formatDateParam(dayToLocalDate(day)));
  if (view === "day") params.delete(VIEW_PARAM);
  else params.set(VIEW_PARAM, view);
  return params.toString();
}

interface DayViewState {
  day: string;
  view: MyDayView;
  setDay(day: string): void;
  setView(view: MyDayView): void;
}

/** Day and view that follow the URL and write back to it. */
function useUrlDayView(today: string): DayViewState {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlDay = dayFromParam(params.get(DATE_PARAM), today);
  const urlView = viewFromParam(params.get(VIEW_PARAM));

  const [day, setDayState] = useState(urlDay);
  const [view, setViewState] = useState(urlView);
  // Follow the URL when it changes under us (links, back/forward), without an effect.
  const [seen, setSeen] = useState({ urlDay, urlView });
  if (seen.urlDay !== urlDay || seen.urlView !== urlView) {
    setSeen({ urlDay, urlView });
    setDayState(urlDay);
    setViewState(urlView);
  }

  const search = params.toString();
  const write = useCallback(
    (nextDay: string, nextView: MyDayView) => {
      const next = searchWithDayView(search, nextDay, nextView, today);
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    },
    [router, pathname, search, today],
  );

  const setDay = useCallback(
    (next: string) => {
      setDayState(next);
      write(next, view);
    },
    [write, view],
  );
  const setView = useCallback(
    (next: MyDayView) => {
      setViewState(next);
      write(day, next);
    },
    [write, day],
  );

  return { day, view, setDay, setView };
}

/** Day and view held in memory only (demo states, tests, the styleguide). */
function useLocalDayView(initialDay: string, initialView: MyDayView): DayViewState {
  const [day, setDay] = useState(initialDay);
  const [view, setView] = useState(initialView);
  return { day, view, setDay, setView };
}

// ── Provider ─────────────────────────────────────────────────────────────

interface ProviderBaseProps {
  children: ReactNode;
  /** Initial energy; default the planner setting. */
  initialEnergy?: EnergyLevel;
  initialFilter?: UnscheduledRange;
  initialSelectedBlockId?: string | null;
  /**
   * Demo harnesses only: an ISO instant that replaces the planner clock, to
   * show "after hours" without a running block. The screen never sets it.
   */
  now?: string;
  /** Demo harnesses only: open Reschedule on mount (a popover with no anchor, or the sheet below lg). */
  initialReschedule?: Pick<RescheduleRequest, "target" | "preselect">;
}

export type MyDayProviderProps =
  | (ProviderBaseProps & { syncUrl?: true; initialDay?: never; initialView?: never })
  | (ProviderBaseProps & { syncUrl: false; initialDay?: string; initialView?: MyDayView });

export function MyDayProvider(props: MyDayProviderProps) {
  const { children, initialEnergy, initialFilter, initialSelectedBlockId, initialReschedule, now = null } = props;
  const today = now ? dayOfInstant(now) : getPlannerToday();
  const common = { today, initialEnergy, initialFilter, initialSelectedBlockId, initialReschedule };
  return (
    <PlannerNowContext.Provider value={now}>
      {props.syncUrl === false ? (
        <LocalProvider {...common} initialDay={props.initialDay ?? today} initialView={props.initialView ?? "day"}>
          {children}
        </LocalProvider>
      ) : (
        <UrlProvider {...common}>{children}</UrlProvider>
      )}
    </PlannerNowContext.Provider>
  );
}

interface InnerProps {
  children: ReactNode;
  today: string;
  initialEnergy?: EnergyLevel;
  initialFilter?: UnscheduledRange;
  initialSelectedBlockId?: string | null;
  initialReschedule?: Pick<RescheduleRequest, "target" | "preselect">;
}

function UrlProvider({ children, ...rest }: InnerProps) {
  const dayView = useUrlDayView(rest.today);
  return (
    <StateProvider dayView={dayView} {...rest}>
      {children}
    </StateProvider>
  );
}

function LocalProvider({
  children,
  initialDay,
  initialView,
  ...rest
}: InnerProps & { initialDay: string; initialView: MyDayView }) {
  const dayView = useLocalDayView(initialDay, initialView);
  return (
    <StateProvider dayView={dayView} {...rest}>
      {children}
    </StateProvider>
  );
}

function StateProvider({
  children,
  dayView,
  today,
  initialEnergy,
  initialFilter = "today",
  initialSelectedBlockId = null,
  initialReschedule,
}: InnerProps & { dayView: DayViewState }) {
  const { planning } = usePlannerSettings();
  const [energy, setEnergy] = useState<EnergyLevel>(initialEnergy ?? planning.defaultEnergy);
  const [selectedBlockId, selectBlock] = useState<string | null>(initialSelectedBlockId);
  const [filter, setFilter] = useState<UnscheduledRange>(initialFilter);
  const [reschedule, setReschedule] = useState<RescheduleRequest | null>(
    initialReschedule ? { ...initialReschedule, anchor: null } : null,
  );

  const { day, view, setDay: writeDay, setView } = dayView;

  const value = useMemo<MyDayContextValue>(() => {
    // A new day starts clean: nothing selected, no popover pointing at a block that left the screen.
    const setDay = (next: string) => {
      if (next === day) return;
      selectBlock(null);
      setReschedule(null);
      writeDay(next);
    };
    return {
      day,
      today,
      isToday: day === today,
      view,
      energy,
      selectedBlockId,
      filter,
      reschedule,
      setDay,
      shiftDay: (delta) => setDay(addDaysToDay(day, delta)),
      goToToday: () => setDay(today),
      setView,
      setEnergy,
      selectBlock,
      setFilter,
      openReschedule: (target, anchor = null, options = {}) => setReschedule({ target, anchor, ...options }),
      closeReschedule: () => setReschedule(null),
    };
  }, [day, view, today, energy, selectedBlockId, filter, reschedule, writeDay, setView]);

  return <MyDayContext.Provider value={value}>{children}</MyDayContext.Provider>;
}
