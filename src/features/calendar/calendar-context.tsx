"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { getPlannerToday } from "@/data/clock";
import type { Scope } from "@/data/domain";
import { usePreferences } from "@/features/preferences/use-preferences";
import type { CalendarSystem } from "@/lib/dates/format";
import {
  CAL_PARAM,
  calendarFromParam,
  DATE_PARAM,
  dayFromParam,
  searchWithCalendarState,
  VIEW_PARAM,
  viewFromParam,
  type CalendarUrlState,
  type CalendarView,
} from "./domain/calendar-params";
import { parseHiddenLayers, toggleLayer as toggleHidden } from "./domain/layers";
import { shiftAnchor } from "./domain/navigation";

/*
 * What the Calendar shows: the anchor day, the view and the calendar system
 * (all mirrored to ?date= / ?view= / ?cal=, other params kept), plus the
 * hidden scope layers, which persist per person in this browser. Like My
 * Day, local state answers instantly and follows the URL when it changes
 * under us (links, back/forward). Mount inside <Suspense> (useSearchParams).
 */

export interface CalendarContextValue {
  today: string;
  /** The day the view is built around (the selected day in Month). */
  anchor: string;
  view: CalendarView;
  calendar: CalendarSystem;
  hidden: ReadonlySet<Scope>;
  setAnchor(day: string): void;
  setView(view: CalendarView): void;
  setCalendar(calendar: CalendarSystem): void;
  shift(delta: number): void;
  goToToday(): void;
  toggleLayer(scope: Scope): void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function useCalendar(): CalendarContextValue {
  const value = useContext(CalendarContext);
  if (!value) throw new Error("useCalendar must be used inside <CalendarProvider>.");
  return value;
}

// ── Hidden layers (localStorage, SSR-safe) ───────────────────────────────

const LAYERS_KEY = "mp-calendar-hidden-layers";
const LAYERS_EVENT = "mp-calendar-layers";

function readLayers(): string | null {
  try {
    return window.localStorage.getItem(LAYERS_KEY);
  } catch {
    return null;
  }
}

function subscribeLayers(listener: () => void): () => void {
  window.addEventListener("storage", listener);
  window.addEventListener(LAYERS_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(LAYERS_EVENT, listener);
  };
}

function writeLayers(hidden: ReadonlySet<Scope>) {
  try {
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify([...hidden]));
  } catch {
    // Private mode or blocked storage: the change still applies for this visit.
  }
  window.dispatchEvent(new Event(LAYERS_EVENT));
}

function useHiddenLayers(): [ReadonlySet<Scope>, (scope: Scope) => void] {
  const raw = useSyncExternalStore(subscribeLayers, readLayers, () => null);
  const stored = useMemo(() => parseHiddenLayers(raw), [raw]);
  // Kept in memory too, so toggling works where storage is blocked.
  const [memory, setMemory] = useState<{ raw: string | null; hidden: ReadonlySet<Scope> }>({ raw, hidden: stored });
  const hidden = memory.raw === raw ? memory.hidden : stored;
  const toggle = useCallback(
    (scope: Scope) => {
      const next = toggleHidden(hidden, scope);
      writeLayers(next);
      setMemory({ raw: readLayers(), hidden: next });
    },
    [hidden],
  );
  return [hidden, toggle];
}

// ── Provider ─────────────────────────────────────────────────────────────

export function CalendarProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const preferences = usePreferences();
  const today = getPlannerToday();

  const url: CalendarUrlState = {
    day: dayFromParam(params.get(DATE_PARAM), today),
    view: viewFromParam(params.get(VIEW_PARAM)),
    calendar: calendarFromParam(params.get(CAL_PARAM), preferences.calendar),
  };
  const urlKey = `${url.day}|${url.view}|${url.calendar}`;
  const [state, setState] = useState(url);
  const [seen, setSeen] = useState(urlKey);
  if (seen !== urlKey) {
    setSeen(urlKey);
    setState(url);
  }

  const [hidden, toggleLayer] = useHiddenLayers();
  const search = params.toString();
  const defaultCalendar = preferences.calendar;

  const update = useCallback(
    (patch: Partial<CalendarUrlState>) => {
      const next = { ...state, ...patch };
      setState(next);
      const query = searchWithCalendarState(search, next, { today, calendar: defaultCalendar });
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [state, router, pathname, search, today, defaultCalendar],
  );

  const value = useMemo<CalendarContextValue>(
    () => ({
      today,
      anchor: state.day,
      view: state.view,
      calendar: state.calendar,
      hidden,
      setAnchor: (day) => update({ day }),
      setView: (view) => update({ view }),
      setCalendar: (calendar) => update({ calendar }),
      shift: (delta) => update({ day: shiftAnchor(state.view, state.day, delta, state.calendar) }),
      goToToday: () => update({ day: today }),
      toggleLayer,
    }),
    [today, state, hidden, update, toggleLayer],
  );

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}
