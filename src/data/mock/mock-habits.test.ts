import { describe, expect, it } from "vitest";
import { sampleDays } from "@/fixtures/personal";
import { createMockRepositories } from "./mock-repositories";

describe("mock habits repository (P12)", () => {
  it("creates (starting today), validates and updates without touching other habits", async () => {
    const { habits } = createMockRepositories();
    await expect(habits.create({ title: " " })).rejects.toMatchObject({ code: "invalid" });
    await expect(habits.create({ title: "Stretch", restWeekdays: [0, 1, 2, 3, 4, 5, 6] })).rejects.toMatchObject({ code: "invalid" });
    await expect(habits.create({ title: "Stretch", reminder: { time: "25:00", ifNotDone: true } })).rejects.toMatchObject({ code: "invalid" });
    const created = await habits.create({
      title: " Stretch ",
      icon: "leaf",
      restWeekdays: [5, 5],
      target: { amount: 10, unit: "min" },
      preferredTime: "07:30",
      reminder: { time: "07:30", ifNotDone: true },
    });
    expect(created).toMatchObject({ title: "Stretch", startDay: sampleDays.today, restWeekdays: [5], doneDays: [], pinned: false });
    const updated = await habits.update(created.id, { title: "Stretch more", target: null, reminder: null });
    expect(updated).toMatchObject({ title: "Stretch more", target: null, reminder: null, preferredTime: "07:30" });
    await expect(habits.update(created.id, { title: "" })).rejects.toMatchObject({ code: "invalid" });
    expect((await habits.list()).find((habit) => habit.id === created.id)!.title).toBe("Stretch more");
    await expect(habits.update("nope", { title: "x" })).rejects.toMatchObject({ code: "not-found" });
  });

  it("archives out of the list and restores (Undo)", async () => {
    const { habits } = createMockRepositories();
    await habits.setArchived("h-read", true);
    expect((await habits.list()).map((habit) => habit.id)).not.toContain("h-read");
    const restored = await habits.setArchived("h-read", false);
    expect(restored).toMatchObject({ archived: false, pinned: true });
    expect((await habits.list()).map((habit) => habit.id)).toContain("h-read");
  });

  it("keeps a day in one state: skip / rest / done, and the full logged target is done", async () => {
    const { habits } = createMockRepositories();
    const day = sampleDays.today;
    let read = await habits.setDayMark("h-read", day, "skip");
    expect(read.skippedDays).toContain(day);
    read = await habits.setDayMark("h-read", day, "rest");
    expect(read.skippedDays).not.toContain(day);
    expect(read.restDays).toContain(day);
    read = await habits.setDone("h-read", day, true);
    expect(read.restDays).not.toContain(day);
    expect(read.doneDays).toContain(day);
    read = await habits.logAmount("h-read", day, 12);
    expect(read.amounts?.[day]).toBe(12);
    expect(read.doneDays).not.toContain(day);
    read = await habits.logAmount("h-read", day, 20);
    expect(read.doneDays).toContain(day);
    await expect(habits.logAmount("h-meditate", day, 3)).rejects.toMatchObject({ code: "invalid" });
    await expect(habits.setDayMark("h-read", "nope", "skip")).rejects.toMatchObject({ code: "invalid" });
  });
});
