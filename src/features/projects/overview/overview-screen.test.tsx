import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { routerPush, setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { ProjectOverviewScreen } from "./overview-screen";

function renderOverview(search = "", options?: Parameters<typeof renderWithProviders>[1]) {
  setMockPathname("/projects/website-redesign");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <ProjectOverviewScreen />
    </ProjectGate>,
    options,
  );
}

describe("PJ-01 · Project overview", () => {
  it("shows the header, the one signature status card with the pace marker and four KPIs", async () => {
    renderOverview();
    expect(await screen.findByRole("heading", { level: 1, name: "Website Redesign" })).toBeInTheDocument();
    expect(screen.getByText("You · Manager")).toBeInTheDocument();
    const status = await screen.findByRole("region", { name: "Project status" });
    expect(status).toHaveAttribute("data-notch-actions", "1");
    expect(within(status).getByText("58%")).toBeInTheDocument();
    expect(within(status).getByText("24 of 41 tasks done")).toBeInTheDocument();
    expect(within(status).getByText(/Build is 4 days behind/)).toBeInTheDocument();
    expect(within(status).getByText("Expected today: 64%")).toBeInTheDocument();
    expect(status.querySelector("[data-slot=pace-marker]")).not.toBeNull();
    const kpis = await within(status).findByRole("list", { name: "Project status figures" });
    expect(within(kpis).getAllByRole("listitem")).toHaveLength(4);
    expect(kpis).toHaveTextContent("Overdue tasks2oldest 4 days");
    expect(kpis).toHaveTextContent("Open risks21 high");
    // No ring anywhere: progress is number + linear bar.
    expect(screen.queryByRole("img", { name: /ring/i })).not.toBeInTheDocument();
  });

  it("notch = Open tasks", async () => {
    const user = userEvent.setup();
    renderOverview();
    await user.click(await screen.findByRole("button", { name: "Open tasks" }));
    expect(routerPush).toHaveBeenCalledWith("/projects/website-redesign/tasks");
  });

  it("For you: two pending assignments; Accept moves one to my open tasks", async () => {
    const user = userEvent.setup();
    renderOverview();
    const card = await screen.findByRole("region", { name: /For you/ });
    expect(card).toHaveTextContent("2 waiting");
    expect(card).toHaveTextContent("Sara P. assigned you");
    expect(within(card).getByText("My open tasks · 3")).toBeInTheDocument();
    await user.click(within(card).getAllByRole("button", { name: "Accept" })[0]!);
    await waitFor(() => expect(within(card).getByText("My open tasks · 4")).toBeInTheDocument());
    expect(card).toHaveTextContent("1 waiting");
  });

  it("Decline opens the decline form with reason chips and a note", async () => {
    const user = userEvent.setup();
    renderOverview();
    const card = await screen.findByRole("region", { name: /For you/ });
    await user.click(within(card).getAllByRole("button", { name: "Decline" })[0]!);
    const sheet = await screen.findByRole("dialog", { name: "Decline assignment" });
    expect(within(sheet).getByText("Tell Sara P. why — it helps reassign.")).toBeInTheDocument();
    await user.click(within(sheet).getByRole("radio", { name: "Not my area" }));
    await user.type(within(sheet).getByRole("textbox", { name: "Note" }), "Payments is Kian's");
    await user.click(within(sheet).getByRole("button", { name: "Decline" }));
    await waitFor(() => expect(card).toHaveTextContent("1 waiting"));
  });

  it("phases, milestones and the project sections (Activity · Risks & blockers · Team load)", async () => {
    const user = userEvent.setup();
    renderOverview();
    const phases = await screen.findByRole("region", { name: /Phases & timeline/ });
    expect(phases).toHaveTextContent("4d behind");
    expect(within(phases).getByRole("listitem", { current: "step" })).toHaveTextContent("Build");
    expect(screen.getByRole("region", { name: "Next milestones" })).toHaveTextContent("blocked by API access");
    const tabs = screen.getByRole("tablist", { name: "Project sections" });
    const names = within(tabs).getAllByRole("tab");
    expect(names).toHaveLength(3);
    expect(names[0]).toHaveTextContent("Activity");
    await waitFor(() => expect(names[1]).toHaveTextContent("Risks & blockers 2 open"));
    expect(names[2]).toHaveTextContent("Team load this week");
    expect(await screen.findByText(/Sara P\. set status to At risk/)).toBeInTheDocument();
    await user.click(within(tabs).getByRole("tab", { name: /Team load/ }));
    expect(await screen.findByText("From task estimates in this project only")).toBeInTheDocument();
    expect(screen.getByText("34h / 30h week")).toBeInTheDocument();
  });

  it("Manager edits status + note from the chip popover", async () => {
    const user = userEvent.setup();
    renderOverview();
    await user.click(await screen.findByRole("button", { name: "Change status: At risk" }));
    const popover = await screen.findByRole("dialog", { name: "Project status" });
    await user.click(within(popover).getByRole("radio", { name: "On track" }));
    const note = within(popover).getByRole("textbox", { name: "Status note" });
    await user.clear(note);
    await user.type(note, "Vendor sent keys.");
    await user.click(within(popover).getByRole("button", { name: "Save status" }));
    expect(await screen.findByText("Vendor sent keys.")).toBeInTheDocument();
  });

  it("Viewer: read-only status, no New task, no For you, no Team load", async () => {
    renderOverview("state=read-only");
    expect(await screen.findByText("You’re a Viewer in this project · editing is off")).toBeInTheDocument();
    await screen.findByRole("region", { name: "Project status" });
    expect(screen.queryByRole("button", { name: /Change status/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /For you/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /Team load/ })).not.toBeInTheDocument();
  });

  it("Guest sees only their shared tasks", async () => {
    renderOverview("state=guest");
    expect(await screen.findByText("Limited access · you see 3 shared tasks only")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Project status" })).not.toBeInTheDocument();
    expect(await screen.findByRole("region", { name: /Your shared tasks/ })).toBeInTheDocument();
  });

  it("Archived: banner and no actions", async () => {
    renderOverview("state=archived");
    expect(await screen.findByText(/^Archived .* · read-only$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New task" })).not.toBeInTheDocument();
  });

  it("renders Persian with Persian digits", async () => {
    renderOverview("", { preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } });
    const status = await screen.findByRole("region", { name: "وضعیت پروژه" });
    expect(within(status).getByText("۲۴ از ۴۱ کار انجام شد")).toBeInTheDocument();
    expect(screen.getByText("شما · مدیر")).toBeInTheDocument();
  });
});
