import { describe, expect, it } from "vitest";
import { sampleInboxItems } from "@/fixtures/personal/inbox";
import { sampleDays, sampleInstant } from "@/fixtures/personal/sample-day";
import { createMockRepositories } from "./mock-repositories";

describe("mock inbox adapter (P07)", () => {
  it("snoozes, archives and restores; the badge counts untriaged only", async () => {
    const { inbox } = createMockRepositories();
    expect(await inbox.count()).toBe(6);
    await inbox.snooze(["i-printer-ink"], sampleInstant(sampleDays.tomorrow, 9));
    await inbox.archive(["i-renew-passport"]);
    expect(await inbox.count()).toBe(4);
    expect((await inbox.list("snoozed")).map((item) => item.id)).toContain("i-printer-ink");
    expect((await inbox.list("archived")).map((item) => item.id)).toContain("i-renew-passport");
    await inbox.restore(["i-printer-ink", "i-renew-passport"]);
    expect(await inbox.count()).toBe(6);
  });

  it("processes and drops as tombstones that Undo restores and lists skip", async () => {
    const { inbox, tasks } = createMockRepositories();
    const task = await tasks.create({ title: "Buy printer ink", date: sampleDays.today, source: "inbox" });
    expect(task.activity?.[0]).toMatchObject({ kind: "created", source: "inbox" });
    const processed = await inbox.process("i-printer-ink", { to: "task", taskId: task.id });
    expect(processed).toMatchObject({ state: "processed", processedTo: "task", taskId: task.id });
    await inbox.drop("i-dinner-sara-reza");
    const listed = (await inbox.list()).map((item) => item.id);
    expect(listed).not.toContain("i-printer-ink");
    expect(listed).not.toContain("i-dinner-sara-reza");
    expect(await inbox.count()).toBe(4);
    const [restored] = await inbox.restore(["i-printer-ink"]);
    expect(restored).toMatchObject({ state: "untriaged" });
    expect(restored!.taskId).toBeUndefined();
  });

  it("wakes a snooze whose time has passed to the top, tagged", async () => {
    const { inbox } = createMockRepositories();
    await inbox.snooze(["i-renew-passport"], sampleInstant(sampleDays.yesterday, 9));
    const [first] = await inbox.list("untriaged");
    expect(first).toMatchObject({ id: "i-renew-passport", backFromSnooze: true });
  });

  it("captures new items and rejects blank text or unknown ids", async () => {
    const { inbox } = createMockRepositories();
    const item = await inbox.capture({ text: "  Call the bank  " });
    expect(item).toMatchObject({ text: "Call the bank", state: "untriaged", source: "quick-add" });
    await expect(inbox.capture({ text: " " })).rejects.toMatchObject({ code: "invalid" });
    await expect(inbox.archive(["nope"])).rejects.toMatchObject({ code: "not-found" });
    expect(sampleInboxItems.find((entry) => entry.id === item.id)).toBeUndefined();
  });
});
