import { describe, expect, it } from "vitest";
import { quickParse } from "./quick-parse";

const TODAY = "2026-10-13";

describe("quickParse", () => {
  it("reads the board example: “call mom tomorrow 18:00 !high ~15m”", () => {
    expect(quickParse("call mom tomorrow 18:00 !high ~15m", TODAY)).toEqual({
      title: "call mom",
      date: "2026-10-14",
      time: "18:00",
      priority: "high",
      durationMinutes: 15,
      recognized: ["date", "time", "priority", "duration"],
    });
  });

  it("reads the other board example: “Pay rent on 1 Aban !high”", () => {
    expect(quickParse("Pay rent on 1 Aban !high", TODAY)).toMatchObject({ title: "Pay rent on 1 Aban", priority: "high" });
  });

  it("returns just a title when there is nothing to read", () => {
    expect(quickParse("  Water   the plants ", TODAY)).toEqual({ title: "Water the plants", recognized: [] });
    expect(quickParse("", TODAY)).toEqual({ title: "", recognized: [] });
  });

  it("reads every priority word, case-insensitively", () => {
    for (const [word, priority] of [["urgent", "urgent"], ["HIGH", "high"], ["Medium", "medium"], ["low", "low"]] as const) {
      expect(quickParse(`x !${word}`, TODAY).priority).toBe(priority);
    }
    expect(quickParse("x !nonsense", TODAY)).toMatchObject({ title: "x !nonsense", recognized: [] });
  });

  it("reads Persian priority words", () => {
    expect(quickParse("خرید !فوری", TODAY)).toMatchObject({ title: "خرید", priority: "urgent" });
    expect(quickParse("خرید !بالا", TODAY).priority).toBe("high");
    expect(quickParse("خرید !متوسط", TODAY).priority).toBe("medium");
    expect(quickParse("خرید !کم", TODAY).priority).toBe("low");
  });

  it("reads durations: 15m, 1h, 1h30m, 90, Persian units and digits", () => {
    const minutes = (text: string) => quickParse(`x ${text}`, TODAY).durationMinutes;
    expect(minutes("~15m")).toBe(15);
    expect(minutes("~1h")).toBe(60);
    expect(minutes("~1h30m")).toBe(90);
    expect(minutes("~90")).toBe(90);
    expect(minutes("~۱۵د")).toBe(15);
    expect(minutes("~۱س")).toBe(60);
    expect(minutes("~۱س۳۰د")).toBe(90);
    expect(minutes("~")).toBeUndefined();
    expect(minutes("~0m")).toBeUndefined();
    expect(minutes("~99h")).toBeUndefined();
    expect(quickParse("x ~abc", TODAY).title).toBe("x ~abc");
  });

  it("reads date words relative to the planner's today", () => {
    expect(quickParse("a today", TODAY)).toMatchObject({ title: "a", date: TODAY });
    expect(quickParse("a امروز", TODAY).date).toBe(TODAY);
    expect(quickParse("تماس با مامان فردا", TODAY)).toMatchObject({ title: "تماس با مامان", date: "2026-10-14" });
    expect(quickParse("a پس‌فردا", TODAY).date).toBe("2026-10-15");
    expect(quickParse("a tomorrow", "2026-12-31").date).toBe("2027-01-01");
  });

  it("reads times: 18:00, 9:05, Persian digits, “at 18”, “ساعت ۱۸”", () => {
    expect(quickParse("a 18:00", TODAY).time).toBe("18:00");
    expect(quickParse("a 9:05", TODAY).time).toBe("09:05");
    expect(quickParse("a ۱۸:۳۰", TODAY).time).toBe("18:30");
    expect(quickParse("call at 18", TODAY)).toMatchObject({ title: "call", time: "18:00" });
    expect(quickParse("call at 18:30", TODAY)).toMatchObject({ title: "call", time: "18:30" });
    expect(quickParse("تماس با مامان فردا ساعت ۱۸ ~۱۵د", TODAY)).toEqual({
      title: "تماس با مامان",
      date: "2026-10-14",
      time: "18:00",
      durationMinutes: 15,
      recognized: ["date", "time", "duration"],
    });
  });

  it("leaves a time alone without a date, and ignores bad times and bare numbers", () => {
    expect(quickParse("a 18:00", TODAY).date).toBeUndefined();
    expect(quickParse("a 25:00", TODAY)).toMatchObject({ title: "a 25:00", recognized: [] });
    expect(quickParse("Read 30 pages", TODAY)).toMatchObject({ title: "Read 30 pages", recognized: [] });
    expect(quickParse("Take at 30 pages", TODAY).time).toBeUndefined();
  });

  it("takes each kind once: a repeat stays in the title", () => {
    expect(quickParse("a today tomorrow", TODAY)).toMatchObject({ title: "a tomorrow", date: TODAY });
    expect(quickParse("a !low !high", TODAY)).toMatchObject({ title: "a !high", priority: "low" });
  });

  it("works with the tokens first and leaves an empty title when nothing else is typed", () => {
    expect(quickParse("!urgent tomorrow", TODAY)).toMatchObject({ title: "", priority: "urgent", date: "2026-10-14" });
    expect(quickParse("~20m !low Tidy desk", TODAY)).toMatchObject({ title: "Tidy desk", durationMinutes: 20, priority: "low" });
  });

  it("reads #area only for known areas (opt-in), leaving unknown #words in the title", () => {
    const areas = [{ id: "a-fin", name: "Finance" }];
    expect(quickParse("Review expenses #finance", TODAY, { areas })).toMatchObject({
      title: "Review expenses",
      area: { id: "a-fin", name: "Finance" },
      recognized: ["area"],
    });
    expect(quickParse("Review #other", TODAY, { areas }).title).toBe("Review #other");
    expect(quickParse("Review #finance", TODAY).title).toBe("Review #finance");
  });
});
