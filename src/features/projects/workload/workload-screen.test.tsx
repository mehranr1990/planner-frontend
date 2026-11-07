import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerPush, routerReplace, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { loadTier, periodCapacity, WorkloadScreen } from "./workload-screen";

function renderWorkload(search = "") {
  setMockPathname("/projects/website-redesign/workload");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <WorkloadScreen />
    </ProjectGate>,
  );
}

describe("PJ-11 · Workload", () => {
  it("tiers: blue up to capacity, rose over it, none without capacity", () => {
    expect(loadTier(10, 32)).toBe("low");
    expect(loadTier(20, 32)).toBe("mid");
    expect(loadTier(30, 32)).toBe("high");
    expect(loadTier(41, 32)).toBe("over");
    expect(loadTier(4, null)).toBe("none");
  });

  it("is a table of members × weeks with hours and percent, an Unassigned row and a legend", async () => {
    renderWorkload();
    const table = await screen.findByRole("table", { name: "Estimated hours per member and week" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
    expect(within(table).getByRole("rowheader", { name: /Mehran R\./ })).toHaveTextContent("24h / week");
    expect(within(table).getByRole("rowheader", { name: /Ava R\. · guest/ })).toHaveTextContent("no capacity set");
    expect(within(table).queryByRole("rowheader", { name: /Kamran/ })).not.toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Unassigned" })).toBeInTheDocument();
    expect(within(table).getAllByRole("button", { name: /Mehran R\., week of .*: \d+h of 24h \(\d+%\)/ })).toHaveLength(6);
    expect(screen.getByRole("list", { name: "Legend" })).toHaveTextContent("Over capacity");
  });

  it("member-week signature card: notch Reassign a task opens the reassign sheet for the picked task", async () => {
    const user = userEvent.setup();
    renderWorkload("cell=me:1");
    const card = (await screen.findByRole("heading", { level: 2, name: /Mehran R\. ·/ })).closest("section")!;
    expect(card).toHaveAttribute("data-notch-actions", "1");
    expect(card).toHaveTextContent("Only this project’s tasks.");
    await user.click(within(card).getByRole("button", { name: "Reassign a task" }));
    const calls = [...routerPush.mock.calls, ...routerReplace.mock.calls].map((call) => String(call[0]));
    expect(calls.some((href) => href.includes("sheet=assignment-reassign") && href.includes("task="))).toBe(true);
  });

  it("switches: Months scales capacity by weeks of the month; Task count drops percent and rose", async () => {
    expect(periodCapacity(28, { weeks: 31 / 7 })).toBeCloseTo(124);
    expect(periodCapacity(null, { weeks: 1 })).toBeNull();
    const user = userEvent.setup();
    renderWorkload();
    await screen.findByRole("table");
    expect(screen.getByRole("radio", { name: "Weeks" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Months" }));
    const calls = routerReplace.mock.calls.map((call) => String(call[0]));
    expect(calls.at(-1)).toContain("period=months");
  });

  it("Months: calendar-month columns with hours of period capacity", async () => {
    renderWorkload("period=months");
    const table = await screen.findByRole("table", { name: "Estimated hours per member and month" });
    expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    expect(within(table).getAllByRole("button", { name: /Mehran R\., .*: \d+h of \d+h \(\d+%\)/ })).toHaveLength(3);
  });

  it("Task count: counts per member-week, no percent, no rose, legend replaced", async () => {
    renderWorkload("measure=count");
    const table = await screen.findByRole("table", { name: "Open tasks per member and week" });
    const cells = within(table).getAllByRole("button", { name: /Mehran R\., week of .*: \d+ open tasks?/ });
    expect(cells).toHaveLength(6);
    for (const cell of within(table).getAllByRole("button")) {
      expect(cell).toHaveAttribute("data-tier", "none");
      expect(cell.textContent).not.toMatch(/%/);
    }
    expect(screen.queryByRole("list", { name: "Legend" })).not.toBeInTheDocument();
    expect(screen.getByText(/capacity is in hours/)).toBeInTheDocument();
  });

  it("Viewers get the not-available state (no Workload)", async () => {
    renderWorkload("state=read-only");
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
