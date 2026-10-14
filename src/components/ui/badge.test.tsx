import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Badge } from "./badge";

describe("Badge", () => {
  it("shows a count and reads the caller's label instead", () => {
    renderWithProviders(
      <button type="button" className="relative">
        Notifications
        <Badge count={3} label="3 unread" placement="corner" />
      </button>,
    );
    const button = screen.getByRole("button", { name: /3 unread/ });
    const visible = screen.getByText("3");
    expect(visible).toHaveAttribute("aria-hidden", "true");
    expect(visible.parentElement).toHaveClass("bg-danger-text", "absolute", "ring-surface");
    expect(button).toBeInTheDocument();
  });

  it("can describe an aria-labelled icon button", () => {
    renderWithProviders(
      <button type="button" aria-label="Notifications" aria-describedby="bell-badge">
        <Badge id="bell-badge" count={3} label="3 unread" placement="corner" />
      </button>,
    );
    expect(screen.getByRole("button", { name: "Notifications" })).toHaveAccessibleDescription("3 unread");
  });

  it("caps large counts", () => {
    renderWithProviders(<Badge count={250} label="250 unread" />);
    expect(screen.getByText("99+")).toBeInTheDocument();
  });

  it("renders a dot when no count is given", () => {
    renderWithProviders(<Badge label="New activity" />);
    const label = screen.getByText("New activity");
    expect(label).toHaveClass("sr-only");
    expect(label.parentElement).toHaveClass("size-2.5", "bg-danger");
  });

  it("supports primary and neutral tones", () => {
    renderWithProviders(
      <>
        <Badge count={1} tone="primary" label="primary" />
        <Badge count={2} tone="neutral" label="neutral" />
      </>,
    );
    expect(screen.getByText("primary").parentElement).toHaveClass("bg-primary");
    expect(screen.getByText("neutral").parentElement).toHaveClass("bg-hairline");
  });

  it("uses Persian digits when the preference asks for them", () => {
    renderWithProviders(<Badge count={12} label="۱۲ اعلان" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByText("۱۲")).toBeInTheDocument();
  });
});
