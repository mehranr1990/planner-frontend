import { describe, expect, it } from "vitest";
import { localeFromAccount, localPatch, serverChanges } from "./account-settings-map";

const server = { locale: "fa-IR", timezone: "Asia/Tehran", preferredCalendar: "JALALI" as const, firstDayOfWeek: 6 };

describe("account settings mapping", () => {
  it("maps BCP 47 tags to app languages and ignores unsupported ones", () => {
    expect([localeFromAccount("fa-IR"), localeFromAccount("en_US"), localeFromAccount("EN"), localeFromAccount("de")]).toEqual([
      "fa",
      "en",
      "en",
      null,
    ]);
  });

  it("is in sync when language, calendar and Sunday-based first weekday match", () => {
    const local = { locale: "fa", calendar: "jalali", weekStartsOn: 6 } as const;
    expect(serverChanges(server, local)).toEqual({});
    expect(localPatch(local, server)).toBeNull();
  });

  it("reports server → local changes", () => {
    expect(serverChanges({ ...server, locale: "en-US", preferredCalendar: "GREGORIAN", firstDayOfWeek: 1 }, { locale: "fa", calendar: "jalali", weekStartsOn: 6 })).toEqual({
      locale: "en",
      calendar: "gregorian",
      weekStartsOn: 1,
    });
  });

  it("builds a partial local → server patch that keeps the server's region when the language is unchanged", () => {
    expect(localPatch({ locale: "fa", calendar: "gregorian", weekStartsOn: 0 }, server)).toEqual({
      preferredCalendar: "GREGORIAN",
      firstDayOfWeek: 0,
    });
    expect(localPatch({ locale: "en", calendar: "jalali", weekStartsOn: 6 }, server)).toEqual({ locale: "en" });
  });
});
