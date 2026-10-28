import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { mockViewport } from "@/features/my-day/states/test-utils";
import { renderWithProviders } from "@/test/render";
import { setMockSearch } from "@/test/setup";
import { MyDayDemo } from "./my-day-demo";

/* The /styleguide/my-day harness: the real screen on a state read from ?state=. */

afterEach(() => resetToasts());
beforeEach(() => mockViewport("desktop"));

const timelineBlocks = () => document.querySelectorAll('[data-slot="time-block"]');

function renderDemo(search: string) {
  setMockSearch(search);
  return renderWithProviders(<MyDayDemo />);
}

describe("MyDayDemo", () => {
  it("renders the whole screen without the app shell (no rail, no banner)", async () => {
    renderDemo("");
    expect(screen.getByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
    await waitFor(() => expect(timelineBlocks()).toHaveLength(7));
    expect(document.querySelector("[data-rail]")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Primary" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-demo=my-day]")).toHaveAttribute("data-scope", "personal");
  });

  it("?state=empty shows the empty day", async () => {
    renderDemo("state=empty");
    expect(await screen.findByRole("heading", { name: "Nothing planned yet" })).toBeInTheDocument();
  });

  it("?state=overloaded shows the overload read-out", async () => {
    renderDemo("state=overloaded");
    expect((await screen.findAllByText("Overloaded · 9h 40m of 8h")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("1 overlap")).length).toBeGreaterThan(0);
  });

  it("?state=partial shows the gaps with how many tasks fit", async () => {
    renderDemo("state=partial");
    expect((await screen.findAllByText(/tasks? fit/)).length).toBeGreaterThan(0);
  });

  it("?state=no-current and after-hours leave nothing running", async () => {
    const { unmount } = renderDemo("state=no-current");
    await waitFor(() => expect(timelineBlocks().length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    expect(await screen.findByText(/^Up next · /)).toBeInTheDocument();
    unmount();

    renderDemo("state=after-hours");
    await waitFor(() => expect(timelineBlocks().length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Mark done" })).not.toBeInTheDocument();
    expect(screen.queryByText(/^Now · /)).not.toBeInTheDocument();
  });

  it("?reschedule=<block> opens Reschedule on that block of the chosen state", async () => {
    renderDemo("state=overloaded&reschedule=blk-t-od-client-prep");
    const dialog = await screen.findByRole("dialog", { name: "Reschedule “Client prep”" });
    expect(within(dialog).getByRole("menuitem", { name: /Back to Unscheduled/ })).toBeInTheDocument();
  });

  it("?view=3days starts on the three-day timeline", async () => {
    renderDemo("view=3days");
    expect(await screen.findByRole("radio", { name: "3 days" })).toBeChecked();
  });
});
