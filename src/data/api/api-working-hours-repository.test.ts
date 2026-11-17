import { describe, expect, it } from "vitest";
import { serverCapacity } from "@/features/my-day/domain/capacity";
import { weekToIntervals } from "@/features/personal-services/working-hours-sync";
import { IRAN_WEEK } from "@/lib/dates/week";
import { createApiWorkingHoursRepository } from "./api-working-hours-repository";
import { err, fakeApi, json } from "./test-support";

/* Working hours + schedule capacity against a contract fake (no network). */

const nine = [{ start: "09:00", end: "17:00" }];
const state = (revision: number, exceptions: { date: string; intervals: { start: string; end: string }[] }[] = []) => ({
  workingHours: { intervalsByWeekday: [nine, nine, nine, nine, [], [], nine], exceptions },
  revision,
  timezone: "Asia/Tehran",
  firstDayOfWeek: 6,
});

describe("working hours adapter", () => {
  it("writes read-modify-write with the settings ETag and keeps the latest exceptions after a 409", async () => {
    let puts = 0;
    const api = fakeApi((call) => {
      if (call.method === "GET") return json(puts === 0 ? state(3) : state(4, [{ date: "2026-11-20", intervals: [] }]));
      puts += 1;
      if (puts === 1) {
        expect(call.ifMatch).toBe(`"3"`);
        return err(409);
      }
      expect(call.ifMatch).toBe(`"4"`);
      expect((call.body.workingHours as { exceptions: unknown }).exceptions).toEqual([{ date: "2026-11-20", intervals: [] }]);
      return json({ ...state(5), workingHours: call.body.workingHours });
    });
    const repo = createApiWorkingHoursRepository(api.client);
    const saved = await repo.update((current) => ({ intervalsByWeekday: Array.from({ length: 7 }, () => [{ start: "08:00", end: "16:00" }]), exceptions: current?.exceptions ?? [] }));
    expect(saved.revision).toBe(5);
    expect(api.writes()).toEqual(["PUT /planning/working-hours", "PUT /planning/working-hours"]);
  });

  it("refuses overlapping intervals before any write", async () => {
    const api = fakeApi(() => json(state(1)));
    const repo = createApiWorkingHoursRepository(api.client);
    const bad = [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }];
    await expect(repo.update(() => ({ intervalsByWeekday: [bad, [], [], [], [], [], []], exceptions: [] }))).rejects.toMatchObject({ code: "invalid" });
    expect(api.writes()).toEqual([]);
  });

  it("reads day / week capacity and keeps unknown as null", async () => {
    const api = fakeApi((call) => {
      expect(call.query).toEqual({ weekStartDate: "2026-11-21" });
      return json({
        timezone: "Asia/Tehran",
        revision: 2,
        state: "UNKNOWN",
        days: [{ date: "2026-11-21", state: "UNKNOWN", availableMinutes: null, busyMinutes: 30, reservedMinutes: null, remainingMinutes: null, overbookedMinutes: null }],
        availableMinutes: null,
        reservedMinutes: null,
        remainingMinutes: null,
        overbookedMinutes: null,
      });
    });
    const capacity = await createApiWorkingHoursRepository(api.client).capacity({ weekStartDate: "2026-11-21" });
    expect(capacity?.days[0]).toMatchObject({ state: "UNKNOWN", availableMinutes: null, busyMinutes: 30 });
  });
});

describe("working hours mapping and server capacity", () => {
  it("maps the Iran week: full days get the range, Thursday half, Friday none", () => {
    const intervals = weekToIntervals({ workHours: { start: "09:00", end: "17:00" }, week: IRAN_WEEK });
    expect(intervals[6]).toEqual([{ start: "09:00", end: "17:00" }]);
    expect(intervals[4]).toEqual([{ start: "09:00", end: "13:00" }]);
    expect(intervals[5]).toEqual([]);
  });

  it("uses server totals when configured and never invents them when unknown", () => {
    const configured = serverCapacity([], { state: "CONFIGURED", availableMinutes: 480, reservedMinutes: 300, remainingMinutes: 180, overbookedMinutes: 0 });
    expect(configured).toMatchObject({ known: true, totalMinutes: 480, plannedMinutes: 300, freeMinutes: 180, state: "normal" });
    const over = serverCapacity([], { state: "CONFIGURED", availableMinutes: 240, reservedMinutes: 300, remainingMinutes: 0, overbookedMinutes: 60 });
    expect(over.state).toBe("over");
    const unknown = serverCapacity([], { state: "DST_GAP", availableMinutes: null, reservedMinutes: null, remainingMinutes: null, overbookedMinutes: null });
    expect(unknown).toMatchObject({ known: false, totalMinutes: 0, freeMinutes: 0, state: "empty" });
  });
});
