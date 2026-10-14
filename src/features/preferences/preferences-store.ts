import type { CalendarSystem } from "@/lib/dates/format";
import { defaultLocale, isLocale, type Locale } from "@/lib/locale/config";
import type { DigitSystem } from "@/lib/locale/digits";
import { getDirection, type Direction } from "@/lib/locale/direction";
import type { Currency } from "@/lib/locale/money";

/*
 * User display preferences (language, direction, digits, currency, calendar).
 * The server resolves them per request (see request-preferences.ts) and seeds
 * a per-tree store on the client, so server HTML and hydration always agree.
 * Theme is owned by next-themes.
 */

export interface Preferences {
  locale: Locale;
  direction: Direction;
  digits: DigitSystem;
  currency: Currency;
  calendar: CalendarSystem;
}

/** Defaults that follow from a language; each stays individually overridable. */
export function preferencesForLocale(locale: Locale): Omit<Preferences, "currency"> {
  return locale === "fa"
    ? { locale, direction: getDirection(locale), digits: "fa", calendar: "jalali" }
    : { locale, direction: getDirection(locale), digits: "latn", calendar: "gregorian" };
}

export const defaultPreferences: Preferences = {
  ...preferencesForLocale(defaultLocale),
  currency: "toman",
};

const ALLOWED: { [K in keyof Preferences]: readonly Preferences[K][] } = {
  locale: ["en", "fa"],
  direction: ["ltr", "rtl"],
  digits: ["latn", "fa"],
  currency: ["toman", "rial"],
  calendar: ["jalali", "gregorian"],
};

/**
 * The single validator for untrusted preference data (cookie today, account
 * sync later). Field by field: an invalid value falls back to its default.
 */
export function parsePreferences(data: unknown): Preferences {
  if (typeof data !== "object" || data === null) return defaultPreferences;
  const record = data as Record<string, unknown>;
  const pick = <K extends keyof Preferences>(key: K): Preferences[K] => {
    const value = record[key];
    return (ALLOWED[key] as readonly unknown[]).includes(value)
      ? (value as Preferences[K])
      : defaultPreferences[key];
  };
  return {
    locale: isLocale(record.locale) ? record.locale : defaultPreferences.locale,
    direction: pick("direction"),
    digits: pick("digits"),
    currency: pick("currency"),
    calendar: pick("calendar"),
  };
}

export interface PreferencesStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): Preferences;
  /** Applies a patch and returns the new snapshot. */
  update(patch: Partial<Preferences>): Preferences;
  /** Replaces the snapshot wholesale (e.g. a change made in another tab). */
  replace(next: Preferences): void;
}

/** A small external store for useSyncExternalStore, one per React tree. */
export function createPreferencesStore(initial: Preferences): PreferencesStore {
  const listeners = new Set<() => void>();
  let snapshot = initial;

  const emit = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    update(patch) {
      snapshot = { ...snapshot, ...patch };
      emit();
      return snapshot;
    },
    replace(next) {
      snapshot = next;
      emit();
    },
  };
}
