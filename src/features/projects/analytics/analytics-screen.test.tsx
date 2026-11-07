import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { AnalyticsScreen, buildSnapshotCsv } from "./analytics-screen";

function renderAnalytics(search = "") {
  setMockPathname("/projects/website-redesign/analytics");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <AnalyticsScreen />
    </ProjectGate>,
  );
}

describe("PJ-12 · Analytics", () => {
  it("KPIs state numerator and denominator; charts have summaries and a table view", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    expect(await screen.findByText("24 of 41 tasks done")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Completion" })).toHaveAttribute("aria-valuenow", "58");
    expect(screen.getByText(/of 0 done tasks that had a due date/)).toBeInTheDocument();
    expect(screen.getByText(/In progress → Done · 24 tasks/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Burn-up: 24 of 41 tasks done/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Throughput:/ })).toBeInTheDocument();
    const burn = screen.getByRole("region", { name: "Burn-up" });
    await user.click(within(burn).getByRole("button", { name: "View as table" }));
    expect(within(burn).getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Done by assignee" })).toBeInTheDocument();
    expect(screen.getByText(/^Data as of/)).toBeInTheDocument();
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });

  it("range segmented and Export snapshot (Manager+) with CSV", async () => {
    const user = userEvent.setup();
    renderAnalytics();
    await screen.findByText("24 of 41 tasks done");
    await user.click(screen.getByRole("radio", { name: "4 weeks" }));
    expect(screen.getByRole("radio", { name: "4 weeks" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("button", { name: "Export snapshot" }));
    const dialog = await screen.findByRole("dialog", { name: "Export snapshot" });
    await user.click(within(dialog).getByRole("button", { name: "Export" }));
    expect(await screen.findByText("Snapshot downloaded")).toBeInTheDocument();
  });

  it("not enough data keeps the KPIs; viewers get no export and no assignee breakdown", async () => {
    const { unmount } = renderAnalytics("state=empty");
    expect(await screen.findByRole("heading", { name: "Not enough data yet" })).toBeInTheDocument();
    expect(screen.getByText("24 of 41 tasks done")).toBeInTheDocument();
    unmount();
    renderAnalytics("state=read-only");
    await screen.findByText("24 of 41 tasks done");
    expect(screen.queryByRole("button", { name: "Export snapshot" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Done by assignee" })).not.toBeInTheDocument();
  });

  it("builds an escaped CSV", () => {
    const csv = buildSnapshotCsv(
      {
        asOf: "2026-10-13T14:35:00+03:30",
        kpis: { done: 1, total: 2, onTime: 0, doneWithDue: 0, cycleMedianDays: null, cycleSample: 0, overdue: 0, overdueBlocked: 0 },
        weeks: ["2026-10-12"],
        scope: [2],
        doneCumulative: [1],
        throughput: [1],
        byStatus: [],
        byAssignee: [],
        enoughData: true,
      },
      [
        {
          id: "t1",
          projectId: "p",
          title: 'Say "hi", world',
          statusId: "todo",
          phaseId: "x",
          milestoneId: null,
          assignees: [],
          priority: "low",
          due: null,
          estimateHours: null,
          blockedBy: [],
          subtasks: { done: 0, total: 0 },
          commentCount: 0,
          revision: 1,
          updatedAt: "2026-10-13T10:00:00+03:30",
        },
      ],
      () => "To do",
    );
    expect(csv).toContain('t1,"Say ""hi"", world",To do');
    expect(csv.split("\n")[1]).toBe("completion_done,1,2");
  });
});
