import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Providers } from "@/app/providers";
import { defaultPreferences, type Preferences } from "@/features/preferences/preferences-store";
import { routerRefresh } from "@/test/setup";
import { StyleguideView } from "./styleguide-view";

function renderStyleguide(preferences: Preferences = defaultPreferences) {
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
