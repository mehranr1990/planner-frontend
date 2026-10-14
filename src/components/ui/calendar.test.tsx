import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Calendar } from "./calendar";

// Tue 13 Oct 2026 = 21 Mehr 1405, the date used across the boards.
const TODAY = new Date(2026, 9, 13);
const fa = { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } as const;
const enJalali = { calendar: "jalali" } as const;

function dayButton(name: string | RegExp) {
  return screen.getByRole("button", { name });
}

describe("Calendar", () => {
  it("renders a Saturday-first Jalali month with the Gregorian equivalent", () => {
    renderWithProviders(<Calendar today={TODAY} />, { preferences: enJalali });
    const grid = screen.getByRole("grid", { name: "Mehr 1405" });
    expect(screen.getByText("September – October 2026")).toBeInTheDocument();
    const headers = within(grid).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Sa", "Su", "Mo", "Tu", "We", "Th", "Fr"]);
    expect(headers[6]).toHaveClass("text-weekend-text");
    expect(headers[0]).toHaveAttribute("abbr", "Saturday");

    // 1 Mehr is a Wednesday: four hidden leading cells.
    const firstRow = within(grid).getAllByRole("row")[1]!;
    const cells = within(firstRow).getAllByRole("gridcell");
    expect(cells.slice(0, 4).every((cell) => cell.childElementCount === 0)).toBe(true);
    expect(cells[4]).toHaveTextContent("1");
    expect(within(grid).getAllByRole("button")).toHaveLength(30);
  });

  it("marks today and paints Fridays in the weekend tone", () => {
    renderWithProviders(<Calendar today={TODAY} />, { preferences: enJalali });
    expect(dayButton("Tue, 21 Mehr 1405")).toHaveAttribute("aria-current", "date");
    expect(dayButton("Fri, 24 Mehr 1405")).toHaveClass("text-weekend-text");
  });

  it("selects a day by click (uncontrolled) and reports it", async () => {
    const onValueChange = vi.fn();
    renderWithProviders(<Calendar today={TODAY} onValueChange={onValueChange} />, { preferences: enJalali });
    await userEvent.click(dayButton("Sat, 25 Mehr 1405"));
    expect(onValueChange).toHaveBeenCalledWith(new Date(2026, 9, 17));
    expect(dayButton("Sat, 25 Mehr 1405").closest("td")).toHaveAttribute("aria-selected", "true");
    expect(dayButton("Sat, 25 Mehr 1405")).toHaveClass("bg-primary");
    expect(dayButton("Tue, 21 Mehr 1405").closest("td")).toHaveAttribute("aria-selected", "false");
  });

  it("keeps a single roving tab stop on the selected day", () => {
    renderWithProviders(<Calendar today={TODAY} value={new Date(2026, 9, 5)} />, { preferences: enJalali });
    const focusable = screen.getAllByRole("button").filter((button) => button.tabIndex === 0);
    // Prev, next and exactly one day.
    expect(focusable.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Previous month",
      "Next month",
      "Mon, 13 Mehr 1405",
    ]);
  });

  it("moves by day and week with arrows, Home/End within the week (LTR)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calendar today={TODAY} />, { preferences: enJalali });
    dayButton("Tue, 21 Mehr 1405").focus();
    await user.keyboard("{ArrowRight}");
    expect(dayButton("Wed, 22 Mehr 1405")).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(dayButton("Wed, 29 Mehr 1405")).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowLeft}");
    expect(dayButton("Tue, 21 Mehr 1405")).toHaveFocus();
    await user.keyboard("{Home}");
    expect(dayButton("Sat, 18 Mehr 1405")).toHaveFocus();
    await user.keyboard("{End}");
    expect(dayButton("Fri, 24 Mehr 1405")).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(dayButton("Fri, 24 Mehr 1405").closest("td")).toHaveAttribute("aria-selected", "true");
  });

  it("changes month with PageUp/PageDown and when arrows cross the edge", async () => {
    const user = userEvent.setup();
    const onMonthChange = vi.fn();
    renderWithProviders(<Calendar today={TODAY} onMonthChange={onMonthChange} />, { preferences: enJalali });
    dayButton("Tue, 21 Mehr 1405").focus();
    await user.keyboard("{PageDown}");
    expect(screen.getByRole("grid", { name: "Aban 1405" })).toBeInTheDocument();
    expect(dayButton("Thu, 21 Aban 1405")).toHaveFocus();
    await user.keyboard("{PageUp}{PageUp}");
    expect(screen.getByRole("grid", { name: "Shahrivar 1405" })).toBeInTheDocument();
    await user.keyboard("{End}{ArrowDown}{ArrowDown}");
    // End → Fri 27 Shahrivar; two weeks down lands on 10 Mehr.
    expect(screen.getByRole("grid", { name: "Mehr 1405" })).toBeInTheDocument();
    expect(dayButton("Fri, 10 Mehr 1405")).toHaveFocus();
    expect(onMonthChange).toHaveBeenCalled();
  });

  it("reverses left/right under RTL and uses Persian digits and names", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calendar today={TODAY} />, { preferences: fa });
    expect(screen.getByRole("grid", { name: "مهر ۱۴۰۵" })).toBeInTheDocument();
    const today = dayButton("سه‌شنبه ۲۱ مهر ۱۴۰۵");
    expect(today).toHaveTextContent("۲۱");
    today.focus();
    await user.keyboard("{ArrowRight}");
    expect(dayButton("دوشنبه ۲۰ مهر ۱۴۰۵")).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(dayButton("چهارشنبه ۲۲ مهر ۱۴۰۵")).toHaveFocus();
    expect(screen.getByRole("button", { name: "ماه قبل" }).querySelector("svg")).toHaveClass("rtl:-scale-x-100");
  });

  it("renders Gregorian months with the Jalali equivalent", () => {
    renderWithProviders(<Calendar today={TODAY} calendar="gregorian" />, { preferences: enJalali });
    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByText("Mehr – Aban 1405")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Oct 2026/ })).toHaveLength(31);
  });

  it("navigates months with the header buttons", async () => {
    renderWithProviders(<Calendar today={TODAY} />, { preferences: enJalali });
    await userEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("grid", { name: "Aban 1405" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("grid", { name: "Shahrivar 1405" })).toBeInTheDocument();
  });

  it("keeps focus on the header button after a no-op keyboard move (Home on the week's first day)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calendar today={TODAY} />, { preferences: enJalali });
    dayButton("Sat, 18 Mehr 1405").focus();
    await user.keyboard("{Home}");
    expect(dayButton("Sat, 18 Mehr 1405")).toHaveFocus();
    const previous = screen.getByRole("button", { name: "Previous month" });
    await user.click(previous);
    expect(screen.getByRole("grid", { name: "Shahrivar 1405" })).toBeInTheDocument();
    expect(previous).toHaveFocus();
  });

  it("keeps focus on the header button after an arrow clamped at max", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calendar today={TODAY} max={new Date(2026, 9, 13)} />, { preferences: enJalali });
    dayButton("Tue, 21 Mehr 1405").focus();
    await user.keyboard("{ArrowRight}");
    expect(dayButton("Tue, 21 Mehr 1405")).toHaveFocus();
    const previous = screen.getByRole("button", { name: "Previous month" });
    await user.click(previous);
    expect(previous).toHaveFocus();
  });

  it("exposes the selected day on the focused button (aria-pressed)", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Calendar today={TODAY} />, { preferences: enJalali });
    expect(dayButton("Tue, 21 Mehr 1405")).toHaveAttribute("aria-pressed", "false");
    await user.click(dayButton("Sat, 25 Mehr 1405"));
    expect(screen.getByRole("button", { name: "Sat, 25 Mehr 1405", pressed: true })).toHaveFocus();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  it("respects disabled predicates and min/max", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(
      <Calendar
        today={TODAY}
        min={new Date(2026, 9, 10)}
        max={new Date(2026, 9, 20)}
        isDateDisabled={(date) => date.getDay() === 5}
        onValueChange={onValueChange}
      />,
      { preferences: enJalali },
    );
    const friday = dayButton("Fri, 24 Mehr 1405");
    expect(friday).toHaveAttribute("aria-disabled", "true");
    await user.click(friday);
    expect(dayButton("Wed, 29 Mehr 1405")).toHaveAttribute("aria-disabled", "true");
    expect(dayButton("Sat, 25 Mehr 1405")).not.toHaveAttribute("aria-disabled");
    expect(dayButton("Mon, 13 Mehr 1405")).toHaveAttribute("aria-disabled", "true");
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();

    // Keyboard focus is clamped to the range.
    dayButton("Tue, 21 Mehr 1405").focus();
    await user.keyboard("{PageDown}");
    expect(screen.getByRole("grid", { name: "Mehr 1405" })).toBeInTheDocument();
    expect(dayButton("Tue, 28 Mehr 1405")).toHaveFocus();
  });

  it("shows outside days muted when asked and event markers", () => {
    renderWithProviders(
      <Calendar today={TODAY} showOutsideDays hasMarker={(date) => date.getDate() === 13} />,
      { preferences: enJalali },
    );
    const outside = dayButton("Sat, 28 Shahrivar 1405");
    expect(outside).toHaveClass("text-fg-muted");
    expect(outside).toHaveAttribute("tabindex", "-1");
    expect(dayButton("Tue, 21 Mehr 1405").querySelector("[aria-hidden]")).toBeInTheDocument();
  });

  it("is controllable", () => {
    const { rerender } = renderWithProviders(
      <Calendar today={TODAY} value={new Date(2026, 9, 1)} month={new Date(2026, 9, 1)} />,
      { preferences: enJalali },
    );
    expect(dayButton("Thu, 9 Mehr 1405").closest("td")).toHaveAttribute("aria-selected", "true");
    rerender(<Calendar today={TODAY} value={null} month={new Date(2026, 11, 1)} />);
    expect(screen.getByRole("grid", { name: "Azar 1405" })).toBeInTheDocument();
  });
});
