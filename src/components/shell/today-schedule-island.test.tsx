import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { TodayScheduleIsland } from "./today-schedule-island";

describe("TodayScheduleIsland", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("shows today's blocks from the data layer, tagged as sample data in mock mode", async () => {
    renderWithProviders(<TodayScheduleIsland />);
    const island = screen.getByRole("region", { name: "Today's schedule" });
    expect(within(island).getByText("Sample data")).toBeInTheDocument();
    expect(await within(island).findAllByRole("listitem")).not.toHaveLength(0);
    expect(within(island).queryByText("Nothing scheduled today")).not.toBeInTheDocument();
  });

  it("drops the sample tag in live mode", () => {
    vi.stubEnv("NEXT_PUBLIC_API_MODE", "live");
    renderWithProviders(<TodayScheduleIsland />);
    const island = screen.getByRole("region", { name: "Today's schedule" });
    expect(within(island).queryByText("Sample data")).not.toBeInTheDocument();
  });
});
