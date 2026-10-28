import { describe, expect, it } from "vitest";
import { sampleDays } from "@/fixtures/personal";
import { createMockRepositories } from "./mock-repositories";

describe("mock module repositories (Overview reads)", () => {
  it("serves habits and checks one in place without touching another store", async () => {
    const repos = createMockRepositories();
    expect((await repos.habits.list()).map((habit) => habit.title)).toEqual(["Water", "Read", "Walk", "Meditate", "Journal"]);
    const read = await repos.habits.setDone("h-read", sampleDays.today, true);
    expect(read.doneDays).toContain(sampleDays.today);
    expect((await createMockRepositories().habits.list()).find((habit) => habit.id === "h-read")!.doneDays).not.toContain(sampleDays.today);
    await expect(repos.habits.setDone("nope", sampleDays.today, true)).rejects.toMatchObject({ code: "not-found" });
  });

  it("returns the budget month containing a day, its position and the next bill", async () => {
    const { finance } = createMockRepositories();
    expect(await finance.monthSummary(sampleDays.today)).toEqual({
      monthStart: "2026-09-23",
      spentToman: 31_200_000,
      budgetToman: 48_000_000,
      dayOfMonth: 21,
      daysInMonth: 30,
      nextBill: { title: "Internet", amountToman: 650_000, dueDay: sampleDays.thursday },
    });
    expect(await finance.monthSummary("2026-12-01")).toBeNull();
  });

  it("filters moods by range, oldest first; goals and the insight come back as stored", async () => {
    const repos = createMockRepositories();
    const week = await repos.journal.moods("2026-10-07", sampleDays.today);
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toMatchObject({ day: sampleDays.today, mood: 4, energy: "medium" });
    expect(await repos.journal.moods("2026-10-12", "2026-10-12")).toHaveLength(1);
    expect((await repos.goals.list()).map((goal) => goal.status)).toEqual(["on-track", "on-track", "behind", "on-track"]);
    expect(await repos.insights.highlight(sampleDays.today)).toMatchObject({ kind: "best-focus-window", startHour: 9 });
  });
});

describe("mock journal write (P10 reflection)", () => {
  it("upserts today's entry with the reflection, drops blanks and rejects bad levels", async () => {
    const { journal } = createMockRepositories();
    const saved = await journal.saveReflection(sampleDays.today, { mood: 5, energy: "high", wentWell: "  Shipped it ", note: " " });
    expect(saved).toMatchObject({ day: sampleDays.today, mood: 5, energy: "high", wentWell: "Shipped it" });
    expect(saved.note).toBeUndefined();
    const day = await journal.moods(sampleDays.today, sampleDays.today);
    expect(day).toHaveLength(1);
    expect(day[0]).toMatchObject({ mood: 5, wentWell: "Shipped it" });
    await expect(journal.saveReflection(sampleDays.today, { mood: 6 as never, energy: "low" })).rejects.toMatchObject({ code: "invalid" });
  });
});
