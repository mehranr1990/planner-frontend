import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { setMockPathname, setMockSearch } from "@/test/setup";
import { ProjectGate } from "../project-gate";
import { TimelineScreen } from "./timeline-screen";

function renderTimeline(search = "") {
  setMockPathname("/projects/website-redesign/timeline");
  setMockSearch(search);
  return renderWithProviders(
    <ProjectGate>
      <TimelineScreen />
    </ProjectGate>,
  );
}

describe("PJ-04 · Timeline", () => {
  it("draws lanes by phase with status bars (min 84px) linking to the task drawer", async () => {
    const { container } = renderTimeline();
    const chart = await screen.findByRole("region", { name: "Timeline of Website Redesign" });
    const link = within(chart).getByRole("link", { name: /^Checkout flow/ });
    expect(link).toHaveAttribute("href", "/projects/website-redesign/tasks/checkout-flow");
    const bar = container.querySelector<HTMLElement>('[data-bar="checkout-flow"]')!;
    expect(parseFloat(bar.style.width)).toBeGreaterThanOrEqual(84);
    // Done phases collapse to one phase bar (no task bars).
    expect(within(chart).queryByRole("link", { name: /^Moodboard/ })).not.toBeInTheDocument();
    expect(within(chart).getByRole("list", { name: "Legend" })).toHaveTextContent("Milestone");
  });

  it("assignee lanes show overlap chips that highlight the bars", async () => {
    const user = userEvent.setup();
    const { container } = renderTimeline();
    await screen.findByRole("region", { name: "Timeline of Website Redesign" });
    await user.click(screen.getByRole("radio", { name: "By assignee" }));
    const chip = (await screen.findAllByRole("button", { name: /overlaps? for / }))[0]!;
    await user.click(chip);
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelectorAll("[data-highlight]").length).toBeGreaterThan(1);
  });
});
