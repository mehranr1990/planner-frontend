import { describe, expect, it } from "vitest";
import { APP_TIME_ZONE, toZonedTime } from "./zone";

// Instants written with explicit offsets, so the assertions hold whatever
// time zone the test process runs in.
describe("toZonedTime", () => {
  it("returns the Tehran wall clock for an instant", () => {
    const zoned = toZonedTime(new Date("2026-10-13T11:05:00Z"), APP_TIME_ZONE);
    expect([zoned.getFullYear(), zoned.getMonth(), zoned.getDate(), zoned.getHours(), zoned.getMinutes()]).toEqual([
      2026, 9, 13, 14, 35,
    ]);
  });

  it("crosses the date line correctly", () => {
    const zoned = toZonedTime(new Date("2026-10-12T21:00:00Z"), APP_TIME_ZONE);
    expect([zoned.getDate(), zoned.getHours(), zoned.getMinutes()]).toEqual([13, 0, 30]);
  });

  it("supports other zones", () => {
    const zoned = toZonedTime(new Date("2026-10-13T11:05:00Z"), "UTC");
    expect([zoned.getHours(), zoned.getMinutes()]).toEqual([11, 5]);
  });

  it("gives the same local fields for the same instant, however it was built", () => {
    const a = toZonedTime(new Date("2026-10-13T14:35:00+03:30"));
    const b = toZonedTime(new Date(Date.UTC(2026, 9, 13, 11, 5)));
    expect(a.getTime()).toBe(b.getTime());
  });
});
