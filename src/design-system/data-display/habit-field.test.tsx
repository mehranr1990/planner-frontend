import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HabitField, type HabitFieldColumn, type HabitFieldRow } from "./habit-field";

const COLUMNS: HabitFieldColumn[] = ["19", "20", "21", "22"].map((date, index) => ({
  key: `2026-10-${date}`,
  weekday: ["Su", "Mo", "Tu", "We"][index]!,
  date,
  weekend: false,
  today: date === "21",
}));

const row = (id: string, title: string, states: HabitFieldRow["cells"][number]["state"][]): HabitFieldRow => ({
  id,
  title,
  streakText: "2d",
  rateText: "50%",
  cells: states.map((state, index) => ({ state, ariaLabel: `${title}, ${COLUMNS[index]!.date}: ${state}`, interactive: state !== "future" && state !== "hidden" })),
});

const ROWS = [row("read", "Read", ["done", "missed", "open", "future"]), row("gym", "Gym", ["hidden", "skipped", "done", "future"])];

describe("HabitField", () => {
  it("toggles a cell, skips on right-click and selects a row by its name", () => {
    const onToggle = vi.fn();
    const onSkip = vi.fn();
    const onSelectRow = vi.fn();
    render(
      <HabitField label="Habit Field" columns={COLUMNS} rows={ROWS} summaryHeader="streak · rate" selectedId="read" onToggle={onToggle} onSkip={onSkip} onSelectRow={onSelectRow} />,
    );
    expect(screen.getByRole("group", { name: "Habit Field" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Read, 20: missed" }));
    expect(onToggle).toHaveBeenCalledWith("read", "2026-10-20");
    fireEvent.contextMenu(screen.getByRole("button", { name: "Read, 21: open" }));
    expect(onSkip).toHaveBeenCalledWith("read", "2026-10-21");
    fireEvent.click(screen.getByRole("button", { name: "Read, 22: future" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    // Before the habit started: blank, not a control.
    expect(screen.queryByRole("button", { name: /Gym, 19/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read", pressed: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Gym", pressed: false }));
    expect(onSelectRow).toHaveBeenCalledWith("gym");
  });

  it("roves one tab stop from today; arrows follow time and mirror in RTL", () => {
    const { rerender } = render(<HabitField label="Field" columns={COLUMNS} rows={ROWS} summaryHeader="" />);
    const today = screen.getByRole("button", { name: "Read, 21: open" });
    expect(today).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(today, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Read, 22: future" })).toHaveFocus();
    rerender(<HabitField label="Field" columns={COLUMNS} rows={ROWS} summaryHeader="" direction="rtl" />);
    expect(screen.getByRole("group", { name: "Field" })).toHaveAttribute("dir", "rtl");
    fireEvent.keyDown(screen.getByRole("button", { name: "Read, 22: future" }), { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "Read, 21: open" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("button", { name: "Read, 21: open" }), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Gym, 21: done" })).toHaveFocus();
  });
});
