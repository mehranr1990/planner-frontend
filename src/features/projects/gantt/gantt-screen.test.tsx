import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import type { ScheduleItem, ScheduleLink } from "@/data/project-domain";
import { makeScale } from "../schedule/time-scale";
import { ProjectGate } from "../project-gate";
import { arrowPath, GanttScreen } from "./gantt-screen";

function renderGantt(search = "") {
  setMockPathname("/projects/website-redesign/gantt");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <GanttScreen />
    </ProjectGate>,
  );
}

describe("PJ-05 · Gantt", () => {
  it("renders the sticky task table, dependency arrows and the critical path", async () => {
    const user = userEvent.setup();
    const { container } = renderGantt();
    const chart = await screen.findByRole("region", { name: "Gantt chart of Website Redesign" });
    expect(within(chart).getByRole("columnheader", { name: "Dur." })).toBeInTheDocument();
    expect(within(chart).getByRole("link", { name: "Checkout flow" })).toBeInTheDocument();
    expect(container.querySelectorAll("[data-arrow]").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Critical path" }));
    await waitFor(() => expect(container.querySelectorAll("[data-critical]").length).toBeGreaterThan(0));
  });

  it("Dependencies list edits by keyboard and refuses a loop inline", async () => {
    const user = userEvent.setup();
    renderGantt();
    await screen.findByRole("region", { name: "Gantt chart of Website Redesign" });
    await user.click(screen.getByRole("button", { name: "Dependencies list" }));
    const list = screen.getAllByRole("heading", { name: /^Dependencies list/ }).at(-1)!.closest("section")!;
    const form = within(list).getByRole("group", { name: "Add dependency" });
    await user.selectOptions(within(form).getByRole("combobox", { name: "Task" }), "Bug bash");
    await user.selectOptions(within(form).getByRole("combobox", { name: "Depends on" }), "UAT sign-off");
    await user.click(within(form).getByRole("button", { name: "Add dependency" }));
    expect(await within(list).findByText("Cycle rejected")).toBeInTheDocument();
    expect(within(list).getByText("“UAT sign-off” already depends on “Bug bash” → this would create a loop.")).toBeInTheDocument();
    await user.click(within(list).getByRole("button", { name: "Edit dependency of UAT sign-off on Bug bash" }));
    await user.selectOptions(within(list).getAllByRole("combobox", { name: "Type" })[0]!, "SS");
    await user.click(within(list).getByRole("button", { name: "Save" }));
    const row = await within(list).findByRole("rowheader", { name: "UAT sign-off" });
    await waitFor(() => expect(row.closest("tr")).toHaveTextContent("SS"));
  });

  it("viewers read the list without edit controls", async () => {
    const user = userEvent.setup();
    renderGantt("state=read-only");
    await screen.findByRole("region", { name: "Gantt chart of Website Redesign" });
    await user.click(screen.getByRole("button", { name: "Dependencies list" }));
    expect(screen.queryByRole("group", { name: "Add dependency" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("button", { name: /^Edit dependency/ })).toHaveLength(0);
  });

  it("mirrors arrows in RTL but keeps predecessor → successor", () => {
    const from: ScheduleItem = { id: "a", kind: "task", title: "A", start: "2026-10-01", end: "2026-10-03", revision: 1 };
    const to: ScheduleItem = { id: "b", kind: "task", title: "B", start: "2026-10-05", end: "2026-10-06", revision: 1 };
    const link: ScheduleLink = { id: "l", predecessorId: "a", successorId: "b", type: "FS", lagDays: 0 };
    const ltr = makeScale("2026-10-01", "2026-10-10", "days", false);
    const rtl = makeScale("2026-10-01", "2026-10-10", "days", true);
    const xs = (path: string) => path.split(" ").filter((_, index, parts) => parts[index - 1] === "M" || parts[index - 1] === "L").map(Number);
    const [ltrStart, ltrEnd] = xs(arrowPath(link, from, to, 0, 1, ltr));
    const [rtlStart, rtlEnd] = xs(arrowPath(link, from, to, 0, 1, rtl));
    expect(rtlStart).toBe(ltr.width - ltrStart!);
    expect(rtlEnd).toBe(ltr.width - ltrEnd!);
  });
});
