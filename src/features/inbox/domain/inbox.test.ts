import { describe, expect, it } from "vitest";
import type { InboxItem } from "@/data/domain";
import { sampleInboxItems } from "@/fixtures/personal/inbox";
import { IRAN_WEEK } from "@/lib/dates/week";
import { groupInbox, oldestAgeDays, snoozeOptions, suggestFor, summarize } from "./inbox";

const TODAY = "2026-10-13"; // Tue 21 Mehr
const untriaged = sampleInboxItems.filter((item) => item.state === "untriaged");

describe("inbox domain (P07)", () => {
  it("suggests from the stored destination, a URL or a parsed date", () => {
    expect(suggestFor({ text: "x", suggested: "event" }, TODAY).target).toBe("event");
    expect(suggestFor({ text: "medium.com/… “Designing calm dashboards”" }, TODAY).target).toBe("note");
    const task = suggestFor({ text: "Pay rent tomorrow !high" }, TODAY);
    expect(task.target).toBe("task");
    expect(task.parsed).toMatchObject({ title: "Pay rent", date: "2026-10-14", priority: "high" });
    expect(suggestFor({ text: "thoughts" }, TODAY).target).toBeNull();
  });

  it("groups Today / Earlier and ages the oldest capture", () => {
    const groups = groupInbox(untriaged, TODAY);
    expect(groups.today.map((item) => item.id)).toEqual(["i-call-ali-lease"]);
    expect(groups.earlier).toHaveLength(5);
    expect(oldestAgeDays(untriaged, TODAY)).toBe(3);
    const back = { ...untriaged[3]!, backFromSnooze: true } satisfies InboxItem;
    expect(groupInbox([back], TODAY).today).toHaveLength(1);
  });

  it("offers evening only before 18:00 and hides next working day when it is tomorrow", () => {
    const afternoon = snoozeOptions("2026-10-13T14:35:00+03:30", IRAN_WEEK);
    expect(afternoon.map((option) => option.id)).toEqual(["evening", "tomorrow", "nextWeek"]);
    expect(afternoon[0]!.until).toBe("2026-10-13T18:00:00+03:30");
    expect(afternoon[2]!.day).toBe("2026-10-17"); // the next Saturday
    // Thursday night: tomorrow is Friday (weekend), the next working day Saturday.
    const thursday = snoozeOptions("2026-10-15T20:00:00+03:30", IRAN_WEEK);
    expect(thursday.map((option) => option.id)).toEqual(["tomorrow", "nextWorkingDay", "nextWeek"]);
    expect(thursday[1]!.day).toBe("2026-10-17");
  });

  it("summarises a processing session", () => {
    expect(summarize(["task", "task", "event", "archive", "task", "task"])).toEqual({ total: 6, tasks: 4, events: 1, archived: 1, other: 0 });
  });
});
