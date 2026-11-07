import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { RisksScreen } from "./risks-screen";

function renderRisks(search = "") {
  setMockPathname("/projects/website-redesign/risks");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <RisksScreen />
    </ProjectGate>,
  );
}

const rowTitles = () =>
  within(screen.getByRole("heading", { name: "Risks", level: 2 }).closest("section")!)
    .getAllByRole("link")
    .map((link) => link.textContent ?? "");

describe("PJ-09 · Risks & issues", () => {
  it("shows the open register sorted by score, pills with counts and the heat map", async () => {
    renderRisks();
    await screen.findByRole("heading", { name: "Heat map" });
    expect(screen.getByRole("radio", { name: "Open 4" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Mine 1" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "High+ 2" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Closed 1" })).toBeInTheDocument();
    const titles = rowTitles();
    expect(titles).toHaveLength(4);
    expect(titles[0]).toContain("Payment API access delayed");
    const row = screen.getByRole("link", { name: /R-07/ });
    expect(row).toHaveAttribute("href", "/projects/website-redesign/risks/payment-api-delay");
    expect(screen.getByRole("button", { name: "High probability, High severity: 1 open" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open issues" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /New risk/ })).toBeInTheDocument();
  });

  it("filters by a heat-map cell (keyboard) and by the Closed pill", async () => {
    const user = userEvent.setup();
    renderRisks();
    const first = await screen.findByRole("button", { name: "High probability, Low severity: 0 open" });
    first.focus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    const highHigh = screen.getByRole("button", { name: "High probability, High severity: 1 open" });
    expect(highHigh).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(highHigh).toHaveAttribute("aria-pressed", "true");
    expect(rowTitles()).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "Clear cell filter" }));
    await user.click(screen.getByRole("radio", { name: "Closed 1" }));
    await waitFor(() => expect(rowTitles()).toHaveLength(1));
    expect(rowTitles()[0]).toContain("Icon licence unclear");
  });

  it("issues segment lists issues with severity only", async () => {
    renderRisks("view=issues");
    await screen.findByRole("heading", { name: "Issues", level: 2 });
    expect(screen.queryByRole("heading", { name: "Heat map" })).not.toBeInTheDocument();
    expect(screen.getByText(/Issues = things that already happened/)).toBeInTheDocument();
    const section = screen.getByRole("heading", { name: "Issues", level: 2 }).closest("section")!;
    expect(within(section).getAllByRole("link")).toHaveLength(2);
  });

  it("empty first use and viewer (New risk hidden)", async () => {
    const { unmount } = renderRisks("state=empty");
    expect(await screen.findByRole("heading", { name: "No risks yet" })).toBeInTheDocument();
    unmount();
    renderRisks("state=read-only");
    await screen.findByRole("heading", { name: "Heat map" });
    expect(screen.queryByRole("button", { name: /New risk/ })).not.toBeInTheDocument();
  });
});
