import { describe, expect, it } from "vitest";
import { sampleDays, sampleTransactions } from "@/fixtures/personal";
import { budgetMonthOf, budgetPace, parseExpenseLine, parseMonthParam, riverData, riverPeak, shiftMonth, withForecast } from "./finance";

describe("finance domain (P13)", () => {
  it("maps days and ?month= to Jalali budget months", () => {
    const mehr = budgetMonthOf(sampleDays.today);
    expect(mehr).toEqual({ start: "2026-09-23", end: "2026-10-22", daysInMonth: 30, key: "1405-07" });
    expect(parseMonthParam("1405-07")).toEqual(mehr);
    expect(parseMonthParam("1405-13")).toBeNull();
    expect(shiftMonth(mehr, -1)).toMatchObject({ start: "2026-08-23", key: "1405-06", daysInMonth: 31 });
  });

  it("measures the pace against the expected spend by today (neutral)", () => {
    const pace = budgetPace({ start: "2026-09-23", daysInMonth: 30, budgetToman: 48_000_000, spentToman: 31_200_000 }, sampleDays.today)!;
    expect(pace).toMatchObject({ day: 21, expected: 33_600_000, closed: false });
    expect(Math.round(pace.diff)).toBe(-2_400_000);
    expect(budgetPace({ start: "2026-08-23", daysInMonth: 31, budgetToman: 1, spentToman: 0 }, sampleDays.today)!.closed).toBe(true);
  });

  it("bins spending daily or weekly, forecasts past today and finds the peak", () => {
    const month = budgetMonthOf(sampleDays.today);
    const daily = riverData(sampleTransactions, month, "month", sampleDays.today);
    expect(daily.points).toHaveLength(30);
    expect(daily.todayIndex).toBe(20);
    expect(daily.values.housing[0]).toBe(12_000_000);
    expect(riverPeak(daily)).toEqual({ index: 0, category: "housing" });
    const forecast = withForecast(daily);
    expect(forecast.values.food[29]).toBeGreaterThan(0);
    expect(riverData(sampleTransactions, month, "quarter", sampleDays.today)).toMatchObject({ unit: "weekly" });
  });

  it("parses the Quick Add line: amount with k/m, #category, description", () => {
    expect(parseExpenseLine("250k lunch #food")).toEqual({ amount: 250_000, category: "food", title: "lunch" });
    expect(parseExpenseLine("ناهار ۲۵۰ هزار #خوراک", { food: "خوراک" } as never)).toEqual({ amount: 250_000, category: "food", title: "ناهار" });
    expect(parseExpenseLine("taxi 1.5m")).toEqual({ amount: 1_500_000, category: null, title: "taxi" });
    expect(parseExpenseLine("coffee")).toEqual({ amount: null, category: null, title: "coffee" });
  });
});
