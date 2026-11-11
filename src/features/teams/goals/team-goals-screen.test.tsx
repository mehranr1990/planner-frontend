import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { paceOf } from "@/data/mock/mock-team-goals";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { TeamGate } from "../team-gate";
import { TeamGoalsScreen } from "./team-goals-screen";

function renderGoals(team = "design", search = "") {
  setMockPathname(`/teams/${team}/goals`);
  setMockSearch(search);
  return renderWithProviders(
    <TeamGate>
      <TeamGoalsScreen />
    </TeamGate>,
  );
}

afterEach(() => resetToasts());

describe("TM-07 · Team goals", () => {
  it("pace thresholds", () => {
    expect(paceOf(0.5, 0.52)).toBe("on-pace");
    expect(paceOf(0.4, 0.52)).toBe("slightly-behind");
    expect(paceOf(0.2, 0.52)).toBe("behind");
  });

  it("lists this period's team goals and shows KR sources, pace and visible linked work", async () => {
    renderGoals();
    const list = await screen.findByRole("list", { name: "Goals" });
    expect(within(list).getAllByRole("link")).toHaveLength(3);
    expect(within(list).queryByText("Research repository live")).not.toBeInTheDocument();
    const card = screen.getByRole("heading", { name: "Ship design system v2" }).closest("section")!;
    expect(within(card).getByText("34 / 60")).toBeInTheDocument();
    expect(within(card).getByText("auto · team tasks tagged “DS v2”")).toBeInTheDocument();
    expect(within(card).getByText("linked task · Icon set v2")).toBeInTheDocument();
    expect(within(card).getByText("Review")).toBeInTheDocument();
    expect(within(card).getByText(/^manual · updated by Sarah P\./)).toBeInTheDocument();
    expect(within(card).getByText("Planner App")).toBeInTheDocument();
    expect(within(card).queryByText("Partner Portal")).not.toBeInTheDocument();
    // A Member who owns no manual KR here: notch = Open linked work.
    expect(within(card).getByRole("button", { name: "Open linked work" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New goal" })).not.toBeInTheDocument();
  });

  it("Update progress on my own manual key result", async () => {
    const user = userEvent.setup();
    renderGoals("design", "goal=accessible-default");
    const card = (await screen.findByRole("heading", { name: "Accessible by default" })).closest("section")!;
    await user.click(within(card).getByRole("button", { name: "Update progress" }));
    const dialog = await screen.findByRole("dialog", { name: "Update progress" });
    const input = within(dialog).getByRole("spinbutton", { name: "Screens audited" });
    expect(within(dialog).queryByRole("spinbutton", { name: "Contrast fixes" })).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "32");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Progress updated")).toBeInTheDocument();
    expect(await within(card).findByText("32 / 40")).toBeInTheDocument();
  });

  it("Leads create goals in the current period", async () => {
    const user = userEvent.setup();
    renderGoals("mobile");
    await user.click(await screen.findByRole("button", { name: "New goal" }));
    const dialog = await screen.findByRole("dialog", { name: "New goal" });
    await user.type(within(dialog).getByRole("textbox", { name: "Title" }), "Offline first");
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Goal added")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Offline first" })).toBeInTheDocument();
  });
});
