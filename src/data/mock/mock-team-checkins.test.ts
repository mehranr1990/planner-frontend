import { describe, expect, it } from "vitest";
import { checkinClosesAt, checkinStatus, checkinWeekOf } from "./mock-team-checkins";
import { createMockTeams } from "./mock-teams";

const respond = <T,>(value: T) => Promise.resolve(structuredClone(value));

describe("mock checkinRepo (TM-09)", () => {
  it("weeks start on Saturday; closes Wed 18:00 Iran time; late for 24h, then closed", () => {
    expect(checkinWeekOf("2026-10-13")).toBe("2026-10-10");
    const closes = checkinClosesAt("2026-10-10", { opensDay: 6, opensTime: "09:00", closesDay: 3, closesTime: "18:00" });
    expect(closes).toBe("2026-10-14T18:00:00+03:30");
    expect(checkinStatus(closes, "2026-10-14T17:59:00+03:30")).toBe("open");
    expect(checkinStatus(closes, "2026-10-15T10:00:00+03:30")).toBe("late");
    expect(checkinStatus(closes, "2026-10-15T18:00:00+03:30")).toBe("closed");
  });

  it("sending clears the rail badge; summary counts only (Viewers not expected); remind once", async () => {
    const store = createMockTeams({ respond });
    const before = await store.teamCheckins.summary("design");
    expect(before).toMatchObject({ replied: 5, total: 7, mine: "missing" });
    await expect(store.teamCheckins.reply("design", "2026-10-10", { did: " ", next: "", blocked: "" })).rejects.toMatchObject({ code: "invalid" });
    await store.teamCheckins.reply("design", "2026-10-10", { did: "Copy review", next: "", blocked: "" });
    expect(await store.teamCheckins.summary("design")).toMatchObject({ replied: 6, mine: "sent" });
    expect(store.findTeam("design")?.checkinMissing).toBe(false);
    await expect(store.teamCheckins.remind("design", "2026-10-10")).rejects.toMatchObject({ code: "forbidden" });
    expect(await store.teamCheckins.remind("mobile", "2026-10-10")).toEqual({ reminded: 3 });
    await expect(store.teamCheckins.remind("mobile", "2026-10-10")).rejects.toMatchObject({ code: "conflict" });
  });

  it("late replies are marked only for the author; closed weeks reject; Viewers read only", async () => {
    const late = createMockTeams({ respond, today: "2026-10-15", now: "2026-10-15T10:00:00+03:30" });
    const week = await late.teamCheckins.reply("design", "2026-10-10", { did: "Copy review", next: "", blocked: "" });
    expect(week.status).toBe("late");
    expect(week.mine.reply?.late).toBe(true);
    expect(week.replies.some((reply) => "late" in reply)).toBe(false);
    await expect(late.teamCheckins.reply("design", "2026-10-03", { did: "x", next: "", blocked: "" })).rejects.toMatchObject({ code: "conflict" });
    await expect(late.teamCheckins.reply("growth", "2026-10-10", { did: "x", next: "", blocked: "" })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("doneByMe suggests my done tasks of that week only", async () => {
    const store = createMockTeams({ respond });
    const done = await store.teamTasks.doneByMe("design", "2026-10-10");
    expect(done.map((task) => task.title)).toEqual(["Critique notes W41", "Quick add sheet"]);
    expect(await store.teamTasks.doneByMe("design", "2026-10-03")).toEqual([]);
  });
});
