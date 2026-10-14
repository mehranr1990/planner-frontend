import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Providers } from "@/app/providers";
import type { Preferences } from "@/features/preferences/preferences-store";
import { testPreferences } from "@/test/render";
import { routerRefresh } from "@/test/setup";
import { StyleguideView } from "./styleguide-view";

// English baseline; the product default (Persian) is covered by explicit preferences.
function renderStyleguide(preferences: Preferences = testPreferences) {
  return render(
    <Providers preferences={preferences}>
      <StyleguideView />
    </Providers>,
  );
}

describe("StyleguideView", () => {
  it("renders every foundation section", () => {
    renderStyleguide();
    expect(screen.getByRole("heading", { level: 1, name: "Foundations" })).toBeInTheDocument();
    for (const name of [
      "The sweep",
      "Context colours",
      "Neutrals",
      "Status",
      "Deep card & data colours",
      "Surfaces & depth",
      "Shadows",
      "Radii & notch",
      "Borders",
      "Typography",
      "Spacing",
      "Focus states",
      "Calendar & dates",
      "Digits & money",
      "Icons · mirror or keep",
      "Mixed text",
      "Motion tokens",
    ]) {
      expect(screen.getByRole("region", { name })).toBeInTheDocument();
    }
  });

  it("shows the 1A foundations: data colours, notch presets, half day, URL dates, compact money", () => {
    renderStyleguide();
    const dataviz = screen.getByRole("region", { name: "Deep card & data colours" });
    for (const name of ["Housing", "Food", "Transport", "Lifestyle", "Work", "Health", "Other", "Mood", "Energy", "Focus"]) {
      expect(within(dataviz).getByText(name)).toBeInTheDocument();
    }

    const radii = screen.getByRole("region", { name: "Radii & notch" });
    expect(within(radii).getByRole("rowheader", { name: "Desktop" })).toBeInTheDocument();
    expect(within(radii).getByRole("rowheader", { name: "Mobile" })).toBeInTheDocument();
    expect(within(radii).getByRole("rowheader", { name: "Focus" })).toBeInTheDocument();
    expect(within(radii).getByText(/fillet 28, button 54/)).toBeInTheDocument();

    const dates = screen.getByRole("region", { name: "Calendar & dates" });
    expect(within(dates).getAllByText("Half day").length).toBeGreaterThan(0);
    // Thursday evening → Saturday: Friday is skipped.
    expect(within(dates).getByText(/^Next working day after Thursday/)).toBeInTheDocument();
    expect(within(dates).getByText("Sat, 17 Oct 2026")).toBeInTheDocument();
    expect(within(dates).getByText("?date=1405-07-21")).toBeInTheDocument();

    const numbers = screen.getByRole("region", { name: "Digits & money" });
    expect(within(numbers).getByText("186.4M Toman")).toBeInTheDocument();
    expect(within(numbers).getByText("1.86B IRR")).toBeInTheDocument();
  });

  it("links the other styleguide pages and marks Foundations as current", () => {
    renderStyleguide();
    const nav = screen.getByRole("navigation", { name: "Styleguide pages" });
    expect(within(nav).getByRole("link", { name: "Foundations" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Components" })).toHaveAttribute("href", "/styleguide/components");
    expect(within(nav).getByRole("link", { name: "Navigation" })).toHaveAttribute("href", "/styleguide/navigation");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("exposes each preview setting as a radiogroup", () => {
    renderStyleguide();
    const controls = screen.getByRole("group", { name: "Preview settings" });
    const theme = within(controls).getByRole("radiogroup", { name: "Theme" });
    expect(within(theme).getAllByRole("radio")).toHaveLength(3);
    expect(within(controls).getByRole("radio", { name: "LTR" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches to Persian: direction, digits and Jalali dates follow", async () => {
    const user = userEvent.setup();
    renderStyleguide();
    await user.click(screen.getByRole("radio", { name: "فارسی" }));

    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.documentElement).toHaveAttribute("lang", "fa");
    expect(screen.getByRole("heading", { level: 1, name: "پایه‌ها" })).toBeInTheDocument();
    expect(screen.getAllByText("سه‌شنبه ۲۱ مهر ۱۴۰۵").length).toBeGreaterThan(0);
    expect(document.cookie).toContain("mp-preferences=");
    expect(decodeURIComponent(document.cookie)).toContain('"locale":"fa"');
    expect(routerRefresh).toHaveBeenCalled();
  });

  it("renders Persian on the first render when the server resolved Persian", () => {
    renderStyleguide({ locale: "fa", direction: "rtl", digits: "fa", currency: "toman", calendar: "jalali" });
    expect(screen.getByRole("heading", { level: 1, name: "پایه‌ها" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "RTL" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches the selected currency to Rial", async () => {
    const user = userEvent.setup();
    renderStyleguide();
    await user.click(screen.getByRole("radio", { name: "Rial" }));
    const numbers = screen.getByRole("region", { name: "Digits & money" });
    const selected = within(numbers).getByText("Selected").nextElementSibling;
    expect(selected).toHaveTextContent("20,000,000 IRR");
  });
});
