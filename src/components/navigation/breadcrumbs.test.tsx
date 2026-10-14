import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Breadcrumbs } from "./breadcrumbs";

const trail = [
  { label: "Personal", href: "/personal" },
  { label: "Mehran" },
  { label: "Overview", href: "/personal" },
];

describe("Breadcrumbs", () => {
  it("renders an ordered trail with links for ancestors and the current page last", () => {
    renderWithProviders(<Breadcrumbs items={trail} scope="personal" />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    const items = within(nav).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(nav).getByRole("link", { name: "Personal" })).toHaveAttribute("href", "/personal");
    expect(within(items[1]!).queryByRole("link")).not.toBeInTheDocument();
    expect(within(items[2]!).queryByRole("link")).not.toBeInTheDocument();
    expect(within(items[2]!).getByText("Overview").closest("[aria-current]")).toHaveAttribute("aria-current", "page");
  });

  it("mirrors separators in RTL and translates the landmark", () => {
    renderWithProviders(
      <div dir="rtl">
        <Breadcrumbs items={[{ label: "شخصی", href: "/personal" }, { label: "نمای کلی" }]} />
      </div>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const nav = screen.getByRole("navigation", { name: "مسیر صفحه" });
    const separators = nav.querySelectorAll("svg");
    expect(separators).toHaveLength(1);
    expect(separators[0]).toHaveClass("rtl:-scale-x-100");
  });

  it("renders nothing without items", () => {
    const { container } = renderWithProviders(<Breadcrumbs items={[]} />);
    expect(container.querySelector("nav")).toBeNull();
  });
});
