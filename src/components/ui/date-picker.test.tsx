import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { DatePicker } from "./date-picker";

const TODAY = new Date(2026, 9, 13);
const fa = { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } as const;

describe("DatePicker", () => {
  it("defaults to the preferred calendar and shows the pick in both calendars", async () => {
    const onValueChange = vi.fn();
    renderWithProviders(<DatePicker today={TODAY} onValueChange={onValueChange} />, {
      preferences: { calendar: "jalali" },
    });
    expect(screen.getByRole("radio", { name: "Jalali" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("No date selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set date" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Tue, 21 Mehr 1405" }));
    expect(onValueChange).toHaveBeenCalledWith(TODAY);
    expect(screen.getByText("Tue, 21 Mehr 1405", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("13 Oct 2026")).toBeInTheDocument();
  });

  it("confirms the picked date", async () => {
    const onConfirm = vi.fn();
    renderWithProviders(<DatePicker today={TODAY} defaultValue={TODAY} onConfirm={onConfirm} />, {
      preferences: { calendar: "jalali" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Set date" }));
    expect(onConfirm).toHaveBeenCalledWith(TODAY);
  });

  it("switches between Jalali and Gregorian, keeping the selection", async () => {
    const onCalendarChange = vi.fn();
    renderWithProviders(
      <DatePicker today={TODAY} defaultValue={TODAY} onCalendarChange={onCalendarChange} />,
      { preferences: { calendar: "jalali" } },
    );
    expect(screen.getByRole("grid", { name: "Mehr 1405" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Gregorian" }));
    expect(onCalendarChange).toHaveBeenCalledWith("gregorian");
    expect(screen.getByRole("grid", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.getByText("Tue, 13 Oct 2026")).toBeInTheDocument();
    expect(screen.getByText("21 Mehr 1405")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tue, 13 Oct 2026" }).closest("td")).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders Persian labels, digits and the weekend legend", () => {
    renderWithProviders(<DatePicker today={TODAY} defaultValue={TODAY} title="تاریخ سررسید" />, {
      preferences: fa,
    });
    expect(screen.getByRole("heading", { name: "تاریخ سررسید" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "شمسی" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("سه‌شنبه ۲۱ مهر ۱۴۰۵", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("۱۳ اکتبر ۲۰۲۶")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت تاریخ" })).toBeEnabled();
    expect(screen.getByText("تعطیل")).toBeInTheDocument();
  });

  it("works controlled", () => {
    renderWithProviders(
      <DatePicker today={TODAY} value={new Date(2026, 9, 20)} calendar="gregorian" onValueChange={() => {}} />,
      { preferences: { calendar: "jalali" } },
    );
    expect(screen.getByRole("radio", { name: "Gregorian" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Tue, 20 Oct 2026")).toBeInTheDocument();
  });
});
