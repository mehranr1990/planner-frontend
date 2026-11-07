import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { ProjectCalendarScreen } from "./project-calendar-screen";

function renderCalendar(search = "view=month") {
  setMockPathname("/projects/website-redesign/calendar");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <ProjectCalendarScreen />
    </ProjectGate>,
  );
}

describe("PJ-07 · Project calendar", () => {
  it("shows the project layer with source chips and the day panel", async () => {
    renderCalendar();
    const panel = (await screen.findByRole("heading", { name: /^Today · / })).closest("section")!;
    expect(within(panel).getByText("Sprint review")).toBeInTheDocument();
    expect(within(panel).getByText("Project event · 6 invited")).toBeInTheDocument();
    expect(screen.getByText(/Members’ personal calendars are never shown/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Task due dates/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^Milestones/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps My personal busy off by default; on shows only untitled hatched slots", async () => {
    const user = userEvent.setup();
    const { container } = renderCalendar();
    const busy = await screen.findByRole("button", { name: "My personal busy · off" });
    expect(container.querySelector("[data-busy]")).toBeNull();
    await user.click(busy);
    expect(await screen.findByRole("button", { name: "My personal busy · on" })).toHaveAttribute("aria-pressed", "true");
    await screen.findAllByText("Busy");
    expect(container.querySelector("[data-busy]")).not.toBeNull();
  });

  it("makes editable task chips draggable; viewers get none", async () => {
    renderCalendar();
    await screen.findByRole("heading", { name: /^Today · / });
    expect(screen.getAllByRole("button", { name: /^Move / }).length).toBeGreaterThan(0);
  });

  it("viewers cannot drag task chips", async () => {
    renderCalendar("view=month&state=read-only");
    await screen.findByRole("heading", { name: /^Today · / });
    expect(screen.queryAllByRole("button", { name: /^Move / })).toHaveLength(0);
  });
});
