import { describe, expect, it, vi } from "vitest";
import type { ToastOptions } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import enMessages from "@/messages/en/myDay.json";
import { createMyDayFormat } from "../ui/use-my-day-format";
import { applyPlan, type DropDeps, type DropMessageKey } from "./apply-drop";
import type { DropPlan } from "./drop-plan";

const DAY = "2026-10-13";
const format = createMyDayFormat({ locale: "en", digits: "latn", calendar: "gregorian" });

/** The English MyDay.drag copy with ICU-free substitution, enough to read what was said. */
function translate(key: DropMessageKey, values: Record<string, string | number> = {}): string {
  const template = (enMessages.drag as Record<string, string>)[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

function setup() {
  const repositories = createMockRepositories();
  const toasts: ToastOptions[] = [];
  const announcements: string[] = [];
  const deps: DropDeps = {
    schedule: (input) => repositories.blocks.schedule(input.taskId, input),
    move: (input) => repositories.blocks.move(input.blockId, input),
    unschedule: ({ blockId }) => repositories.blocks.unschedule(blockId),
    notify: (options) => {
      toasts.push(options);
      return `toast-${toasts.length}`;
    },
    dismissToast: vi.fn(),
    announce: (message) => announcements.push(message),
    t: translate,
    format,
    dayLabel: (day) => day,
  };
  const day = async () => repositories.blocks.listForDay(DAY);
  return { repositories, deps, toasts, announcements, day };
}

const placement = (startMinutes: number, durationMinutes: number) => ({
  day: DAY,
  startMinutes,
  durationMinutes,
  endMinutes: startMinutes + durationMinutes,
  start: `${String(Math.floor(startMinutes / 60)).padStart(2, "0")}:${String(startMinutes % 60).padStart(2, "0")}`,
});

describe("applyPlan", () => {
  it("schedules a task, tells the person and can undo it", async () => {
    const { deps, toasts, announcements, day } = setup();
    const plan: DropPlan = {
      kind: "schedule",
      taskId: "t-review-october-expenses",
      title: "Review October expenses",
      placement: placement(19 * 60, 30),
      overlaps: [],
    };
    expect(await applyPlan(plan, deps)).toBe("applied");
    expect((await day()).some((block) => block.taskId === "t-review-october-expenses")).toBe(true);
    expect(toasts[0]).toMatchObject({ tone: "success", title: "Scheduled “Review October expenses” at 19:00" });
    expect(announcements[0]).toContain("scheduled at 19:00");

    toasts[0]!.action!.onClick();
    await vi.waitFor(async () => {
      expect((await day()).some((block) => block.taskId === "t-review-october-expenses")).toBe(false);
    });
    expect(toasts.at(-1)).toMatchObject({ title: "Undone" });
  });

  it("moves a block, flags the overlap in the toast, and Undo restores the old place", async () => {
    const { deps, toasts, day } = setup();
    const plan: DropPlan = {
      kind: "move",
      blockId: "client-call",
      title: "Client call",
      placement: placement(15 * 60 + 30, 30),
      previous: { day: DAY, start: "16:30", durationMinutes: 30 },
      overlaps: [{ id: "ui-design", title: "UI design", minutes: 30 }],
      resized: false,
    };
    expect(await applyPlan(plan, deps)).toBe("applied");
    expect(toasts[0]).toMatchObject({ tone: "warning", title: "Overlaps UI design by 30m" });
    expect(toasts[0]!.description).toBe("Moved “Client call” to 15:30");

    toasts[0]!.action!.onClick();
    await vi.waitFor(async () => {
      const call = (await day()).find((block) => block.id === "client-call")!;
      expect(call.start).toContain("T16:30");
    });
  });

  it("a resize sends the new length; a plain move keeps it", async () => {
    const { deps, day } = setup();
    const move: DropPlan = {
      kind: "move",
      blockId: "gym",
      title: "Gym",
      placement: placement(18 * 60, 90),
      previous: { day: DAY, start: "17:15", durationMinutes: 60 },
      overlaps: [],
      resized: true,
    };
    await applyPlan(move, deps);
    const gym = (await day()).find((block) => block.id === "gym")!;
    expect(new Date(gym.end).getTime() - new Date(gym.start).getTime()).toBe(90 * 60_000);

    const plain: DropPlan = { ...move, placement: placement(19 * 60, 90), resized: false };
    await applyPlan(plain, deps);
    const moved = (await day()).find((block) => block.id === "gym")!;
    expect(new Date(moved.end).getTime() - new Date(moved.start).getTime()).toBe(90 * 60_000);
  });

  it("unschedules a task block and Undo puts it back where it was", async () => {
    const { deps, toasts, day } = setup();
    const plan: DropPlan = {
      kind: "unschedule",
      blockId: "ui-design",
      taskId: "t-ui-design",
      title: "UI design",
      previous: { day: DAY, start: "14:00", durationMinutes: 120 },
    };
    expect(await applyPlan(plan, deps)).toBe("applied");
    expect((await day()).some((block) => block.id === "ui-design")).toBe(false);
    expect(toasts[0]).toMatchObject({ title: "“UI design” is back in Unscheduled" });

    toasts[0]!.action!.onClick();
    await vi.waitFor(async () => {
      const back = (await day()).find((block) => block.taskId === "t-ui-design");
      expect(back?.start).toContain("T14:00");
    });
  });

  it("rejects out loud and changes nothing", async () => {
    const { deps, toasts, announcements, day } = setup();
    const before = await day();
    const plan: DropPlan = { kind: "reject", reason: "out-of-range", title: "Gym" };
    expect(await applyPlan(plan, deps)).toBe("rejected");
    expect(announcements).toEqual(["Gym can't go there: it would run past midnight."]);
    expect(toasts).toHaveLength(0);
    expect(await day()).toEqual(before);
  });

  it("does nothing for a noop plan", async () => {
    const { deps, toasts, announcements } = setup();
    expect(await applyPlan({ kind: "noop" }, deps)).toBe("noop");
    expect(toasts).toHaveLength(0);
    expect(announcements).toHaveLength(0);
  });

  it("reports a failed save with a danger toast", async () => {
    const { deps, toasts, announcements } = setup();
    const failing: DropDeps = { ...deps, move: () => Promise.reject(new Error("offline")) };
    const plan: DropPlan = {
      kind: "move",
      blockId: "gym",
      title: "Gym",
      placement: placement(18 * 60, 60),
      previous: { day: DAY, start: "17:15", durationMinutes: 60 },
      overlaps: [],
      resized: false,
    };
    expect(await applyPlan(plan, failing)).toBe("failed");
    expect(toasts[0]).toMatchObject({ tone: "danger", title: "Couldn't update “Gym”" });
    expect(announcements[0]).toBe("Couldn't save the change to Gym.");
  });
});
