import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { preferencesForLocale } from "@/features/preferences/preferences-store";
import { sampleDays, sampleHabits } from "@/fixtures/personal";
import { renderWithProviders } from "@/test/render";
import { routerPush } from "@/test/setup";
import { bestStreak, cellState, completion, fieldDays, habitStreak, ribbonCopy, streakWeek, trimBeforeStart } from "./domain/habits";
import { HabitSheet } from "./habit-sheet";
import { HabitsScreen } from "./habits-screen";

const TODAY = sampleDays.today;
const read = sampleHabits.find((habit) => habit.id === "h-read")!;
const walk = sampleHabits.find((habit) => habit.id === "h-walk")!;

function renderHabits(habitId: string | null, options: Parameters<typeof renderWithProviders>[1] & { empty?: boolean } = {}) {
  const { empty, ...rest } = options;
  const repositories = createMockRepositories(empty ? { fixtures: { habits: [] } } : {});
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <HabitsScreen habitId={habitId} />
    </DataProvider>,
    rest,
  );
  return { ...view, repositories };
}

describe("habit rules (P12)", () => {
  it("lays out 14 days around today, hides days before the start and keeps skips from breaking a streak", () => {
    const days = fieldDays("14d", TODAY, "jalali");
    expect(days).toHaveLength(14);
    expect(days.indexOf(TODAY)).toBe(10);
    expect(fieldDays("14d", TODAY, "jalali", true).at(-1)).toBe(TODAY);
    // Mehr 1405 has 30 days; 1405 has 365.
    expect(fieldDays("month", TODAY, "jalali")).toHaveLength(30);
    expect(fieldDays("year", TODAY, "jalali")).toHaveLength(365);
    const fresh = { ...read, startDay: "2026-10-11", doneDays: ["2026-10-11"] };
    expect(cellState(fresh, "2026-10-10", TODAY)).toBe("hidden");
    expect(trimBeforeStart(days, [fresh])[0]).toBe("2026-10-11");
    expect(cellState(walk, sampleDays.saturday, TODAY)).toBe("skipped");
    expect(cellState(read, "2026-10-16", TODAY)).toBe("rest");
    expect(cellState(read, TODAY, TODAY)).toBe("open");
    expect(habitStreak({ ...walk, doneDays: ["2026-10-09", sampleDays.sunday, sampleDays.yesterday] }, TODAY)).toBe(3);
    expect(bestStreak(read, TODAY)).toBe(11);
    expect(completion(read, days, TODAY)).toMatchObject({ done: 9, possible: 9 });
  });

  it("adapts the ribbon CTA copy to the week", () => {
    expect(ribbonCopy(streakWeek(read, TODAY), habitStreak(read, TODAY), TODAY)).toBe("keep");
    const checked = { ...read, doneDays: [...read.doneDays, TODAY] };
    expect(ribbonCopy(streakWeek(checked, TODAY), habitStreak(checked, TODAY), TODAY)).toBe("perfect");
    const missed = { ...read, doneDays: read.doneDays.filter((day) => day !== sampleDays.yesterday) };
    expect(ribbonCopy(streakWeek(missed, TODAY), habitStreak(missed, TODAY), TODAY)).toBe("restart");
    const fresh = { ...read, doneDays: [], startDay: TODAY };
    expect(ribbonCopy(streakWeek(fresh, TODAY), 0, TODAY)).toBe("checkIn");
  });
});

describe("HabitsScreen (P12)", () => {
  it("shows the Today row, the Habit Field and the selected habit (signature head, ribbon, ring card)", async () => {
    renderHabits(null);
    expect(await screen.findByRole("region", { name: "Today’s habits" })).toBeInTheDocument();
    expect(screen.getByText("Personal · 3 of 5 today")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read: not done yet", pressed: false })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Habit Field, 14 days" })).toBeInTheDocument();
    // The pinned habit is selected: its notch holds Check today.
    expect(screen.getByRole("button", { name: "Check today" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Read: 11-day streak, today not done yet" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "History", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read", pressed: true })).toBeInTheDocument();
  });

  it("checks a habit from its tile with an Undo toast, and skips from the context menu", async () => {
    const user = userEvent.setup();
    const { repositories } = renderHabits(null);
    await user.click(await screen.findByRole("button", { name: "Read: not done yet" }));
    await waitFor(async () => expect((await repositories.habits.list()).find((habit) => habit.id === "h-read")!.doneDays).toContain(TODAY));
    expect(await screen.findByText("Read · 12-day streak")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await repositories.habits.list()).find((habit) => habit.id === "h-read")!.doneDays).not.toContain(TODAY));

    fireEvent.contextMenu(await screen.findByRole("button", { name: "Journal: not done yet" }));
    await user.click(await screen.findByRole("menuitem", { name: "Skip today" }));
    await waitFor(async () => expect((await repositories.habits.list()).find((habit) => habit.id === "h-journal")!.skippedDays).toContain(TODAY));
  });

  it("toggles a Field cell and switches the period through the URL", async () => {
    const user = userEvent.setup();
    const { repositories } = renderHabits("h-walk");
    const field = await screen.findByRole("group", { name: "Habit Field, 14 days" });
    await user.click(within(field).getByRole("button", { name: /^Walk, 12 Oct: not done$/ }));
    await waitFor(async () => expect((await repositories.habits.list()).find((habit) => habit.id === "h-walk")!.doneDays).toContain(sampleDays.yesterday));
    expect(screen.getByRole("button", { name: "Walk", pressed: true })).toBeInTheDocument();
  });

  it("shows the empty state, which opens the Habit sheet", async () => {
    const user = userEvent.setup();
    renderHabits(null, { empty: true });
    expect(await screen.findByRole("heading", { name: "No habits yet" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ideas" }));
    await user.click(screen.getByRole("button", { name: "Read 20 pages" }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("sheet=habit"), { scroll: false });
    expect(routerPush.mock.lastCall?.[0]).toContain("title=Read");
  });

  it("speaks Persian with Persian digits in RTL", async () => {
    renderHabits(null, { preferences: preferencesForLocale("fa") });
    expect(await screen.findByRole("heading", { level: 1, name: "عادت‌ها" })).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: /^میدان عادت/ })).toHaveAttribute("dir", "rtl");
    expect(screen.getByText("شخصی · ۳ از ۵ امروز")).toBeInTheDocument();
  });
});

describe("HabitSheet (P18 · B)", () => {
  it("creates a habit on chosen days with a target and a reminder", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const repositories = createMockRepositories();
    renderWithProviders(
      <DataProvider repositories={repositories}>
        <HabitSheet onClose={onClose} />
      </DataProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Create habit" }));
    expect(screen.getByText("Give the habit a name.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Stretch");
    await user.click(screen.getByRole("radio", { name: "Specific days" }));
    await user.click(screen.getByRole("button", { name: "Friday", pressed: true }));
    await user.type(screen.getByRole("spinbutton", { name: "Target amount" }), "10");
    await user.type(screen.getByRole("textbox", { name: "Unit" }), "min");
    await user.click(screen.getByRole("switch", { name: "Reminder" }));
    await user.click(screen.getByRole("button", { name: "Create habit" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const created = (await repositories.habits.list()).find((habit) => habit.title === "Stretch")!;
    expect(created).toMatchObject({ restWeekdays: [5], target: { amount: 10, unit: "min" }, reminder: { time: "20:00", ifNotDone: true }, startDay: TODAY });
  });
});
