import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Check } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { renderWithProviders } from "@/test/render";
import { EmptyState, ErrorState, LoadingState, NoResultsState, UnavailableState } from "./state-views";

const fa = { locale: "fa", direction: "rtl", digits: "fa" } as const;

describe("EmptyState", () => {
  it("renders default copy as a polite status", () => {
    renderWithProviders(<EmptyState />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Nothing here yet");
    expect(status).toHaveTextContent("When something is added, it will show up here.");
    expect(status).toHaveClass("border-dashed");
  });

  it("takes custom copy, icon, heading level and actions", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    renderWithProviders(
      <EmptyState
        title="Nothing left for today"
        description="Pull something from Unscheduled or enjoy the evening."
        icon={Check}
        titleAs="h3"
        variant="card"
        primaryAction={
          <Button variant="secondary" onClick={onOpen}>
            Open Unscheduled
          </Button>
        }
        secondaryAction={<Button variant="ghost">Later</Button>}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Nothing left for today" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveClass("bg-surface", "rounded-card");
    await user.click(screen.getByRole("button", { name: "Open Unscheduled" }));
    expect(onOpen).toHaveBeenCalledOnce();
    // Logical order: secondary first, primary last.
    const buttons = screen.getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Later", "Open Unscheduled"]);
  });

  it("can drop the description and icon", () => {
    renderWithProviders(<EmptyState description={null} icon={null} size="compact" variant="bare" />);
    const status = screen.getByRole("status");
    expect(status.querySelector("svg")).toBeNull();
    expect(status).toHaveAttribute("data-size", "compact");
    expect(status).not.toHaveTextContent("When something is added");
  });
});

describe("ErrorState", () => {
  it("is an alert with a working retry action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <ErrorState title="Couldn’t load the board." description="Check your connection." onRetry={onRetry} />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t load the board.");
    expect(alert).toHaveClass("bg-danger-soft");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("has default copy and no button without onRetry", () => {
    renderWithProviders(<ErrorState size="default" variant="card" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t load this.");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders Persian defaults", () => {
    renderWithProviders(<ErrorState onRetry={vi.fn()} />, { preferences: fa });
    expect(screen.getByRole("alert")).toHaveTextContent("بارگذاری انجام نشد.");
    expect(screen.getByRole("button", { name: "تلاش دوباره" })).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("announces loading politely and renders decorative skeletons", () => {
    renderWithProviders(<LoadingState />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading…");
    expect(status.querySelectorAll("[data-slot=skeleton]").length).toBeGreaterThan(0);
  });

  it("accepts a custom label and anatomy", () => {
    renderWithProviders(
      <LoadingState label="Loading tasks">
        <span data-testid="custom" />
      </LoadingState>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading tasks");
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });

  it("uses the Persian loading text", () => {
    renderWithProviders(<LoadingState />, { preferences: fa });
    expect(screen.getByRole("status")).toHaveTextContent("در حال بارگذاری…");
  });
});

describe("NoResultsState", () => {
  it("names the query in the default title", () => {
    renderWithProviders(<NoResultsState query="invoice" />);
    expect(screen.getByRole("status")).toHaveTextContent("No results for “invoice”");
  });

  it("falls back to a generic title in Persian", () => {
    renderWithProviders(<NoResultsState />, { preferences: fa });
    expect(screen.getByRole("status")).toHaveTextContent("نتیجه‌ای پیدا نشد");
  });
});

describe("UnavailableState", () => {
  it("explains that the section arrives later", () => {
    renderWithProviders(<UnavailableState />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Not available yet");
    expect(status).toHaveTextContent("This section arrives in a later step.");
  });
});

describe("live={false}", () => {
  it("drops the status/alert roles and aria-live so the caller owns announcements", () => {
    renderWithProviders(
      <>
        <EmptyState live={false} title="Empty" />
        <NoResultsState live={false} query="tax" />
        <UnavailableState live={false} />
        <ErrorState live={false} title="Failed" />
        <LoadingState live={false} label="Loading tasks" />
      </>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelector("[aria-live]")).toBeNull();
    // Content is still rendered.
    expect(screen.getByText("Empty")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Loading tasks")).toBeInTheDocument();
  });

  it("keeps the live roles by default", () => {
    renderWithProviders(
      <>
        <EmptyState />
        <ErrorState />
      </>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
