import { describe, expect, it } from "vitest";
import {
  parsePreferencesCookie,
  preferencesCookieString,
  PREFERENCES_COOKIE,
  serializePreferences,
} from "./preferences-cookie";
import {
  createPreferencesStore,
  defaultPreferences,
  parsePreferences,
  preferencesForLocale,
  type Preferences,
} from "./preferences-store";

const persian: Preferences = { locale: "fa", direction: "rtl", digits: "fa", currency: "rial", calendar: "jalali" };

describe("defaultPreferences", () => {
  it("is Persian, RTL, Persian digits, Toman and Jalali on first run", () => {
    expect(defaultPreferences).toEqual({ locale: "fa", direction: "rtl", digits: "fa", currency: "toman", calendar: "jalali" });
  });
});

describe("parsePreferences", () => {
  it("falls back to defaults for non-objects", () => {
    expect(parsePreferences(null)).toEqual(defaultPreferences);
    expect(parsePreferences("fa")).toEqual(defaultPreferences);
    expect(parsePreferences(42)).toEqual(defaultPreferences);
  });

  it("keeps valid fields and replaces invalid ones with the (Persian) defaults", () => {
    const english: Preferences = { locale: "en", direction: "ltr", digits: "latn", currency: "rial", calendar: "gregorian" };
    expect(parsePreferences({ ...english, direction: "sideways", locale: "de" })).toEqual({
      ...english,
      direction: "rtl",
      locale: "fa",
    });
  });

  it("keeps independent combinations (Persian, LTR, Latin digits, Gregorian)", () => {
    const mixed: Preferences = { locale: "fa", direction: "ltr", digits: "latn", currency: "toman", calendar: "gregorian" };
    expect(parsePreferences(mixed)).toEqual(mixed);
  });
});

describe("preferencesForLocale", () => {
  it("derives Persian defaults", () => {
    expect(preferencesForLocale("fa")).toEqual({ locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" });
  });

  it("derives English defaults", () => {
    expect(preferencesForLocale("en")).toEqual({ locale: "en", direction: "ltr", digits: "latn", calendar: "gregorian" });
  });
});

describe("preferences cookie", () => {
  it("round-trips through the encoded value", () => {
    expect(parsePreferencesCookie(serializePreferences(persian))).toEqual(persian);
  });

  it("accepts an already-decoded value (Next's RequestCookies decode)", () => {
    expect(parsePreferencesCookie(JSON.stringify(persian))).toEqual(persian);
  });

  it.each([undefined, null, "", "%E0%A4%A", "{not json", "null"])("falls back to defaults for %j", (raw) => {
    expect(parsePreferencesCookie(raw)).toEqual(defaultPreferences);
  });

  it("builds a first-party, year-long, lax cookie", () => {
    const cookie = preferencesCookieString(persian);
    expect(cookie.startsWith(`${PREFERENCES_COOKIE}=`)).toBe(true);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=31536000");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toMatch(/[\s;]$/);
  });
});

describe("createPreferencesStore", () => {
  it("starts from the seeded (server) value and returns a stable snapshot", () => {
    const store = createPreferencesStore(persian);
    expect(store.getSnapshot()).toBe(persian);
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it("applies patches and notifies subscribers", () => {
    const store = createPreferencesStore(defaultPreferences);
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    const next = store.update({ currency: "rial" });
    expect(next.currency).toBe("rial");
    expect(store.getSnapshot()).toBe(next);
    store.replace(persian);
    expect(store.getSnapshot()).toBe(persian);
    expect(calls).toBe(2);
    unsubscribe();
    store.update({ digits: "latn" });
    expect(calls).toBe(2);
  });

  it("keeps separate trees isolated", () => {
    const a = createPreferencesStore(defaultPreferences);
    const b = createPreferencesStore(persian);
    a.update({ currency: "rial" });
    expect(b.getSnapshot()).toBe(persian);
  });
});
