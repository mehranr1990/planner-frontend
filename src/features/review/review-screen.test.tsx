import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { DataProvider } from "@/data/provider";
import { sampleDays } from "@/fixtures/personal";
import { renderWithProviders } from "@/test/render";
import { routerPush, routerReplace, setMockSearch } from "@/test/setup";
import { WeeklyReviewScreen } from "./review-screen";

// The sample week: Sat 18 Mehr 1405 (2026-10-10) … Fri 24 Mehr; today is Tuesday.
const WEEK = "1405-07-18";
const WEEK_DAY = "2026-10-10";

function renderReview(weekParam = WEEK, options: Parameters<typeof renderWithProviders>[1] = {}) {
  const repositories = createMockRepositories();
  const view = renderWithProviders(
    <DataProvider repositories={repositories}>
      <WeeklyReviewScreen weekParam={weekParam} />
    </DataProvider>,
    options,
  );
  return { ...view, repositories };
}

describe("WeeklyReviewScreen (P16)", () => {
  it("opens on Wins with the Weekly Story, a segmented stepper and Save & exit that keeps progress", async () => {
    const { repositories } = renderReview();
    expect(screen.getByRole("heading", { level: 1, name: "This week" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "Wins" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Carry over/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Share summary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Tasks done: open Carry over$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Next · Carry over/ }));
    expect(routerReplace).toHaveBeenCalledWith(expect.stringContaining("step=carry"), { scroll: false });

    await userEvent.click(screen.getByRole("button", { name: "Save & exit" }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith("/personal"));
    expect(await repositories.review.get(WEEK_DAY)).toMatchObject({ step: "wins" });
  });

  it("finishes from Reflect: the answers go to today's Journal tagged #weekly", async () => {
    setMockSearch("step=reflect");
    const { repositories } = renderReview();
    await userEvent.type(await screen.findByLabelText("What went well"), "Calm mornings");
    await userEvent.click(screen.getByRole("button", { name: /Finish review/ }));
    expect(await screen.findByRole("heading", { name: "Week reviewed" })).toBeInTheDocument();
    const entry = await repositories.journal.entry(sampleDays.today);
    expect(entry?.tags).toContain("weekly");
    expect(entry?.text).toContain("What went well: Calm mornings");
    expect((await repositories.review.get(WEEK_DAY))?.completedAt).not.toBeNull();
  });

  it("shows the carry-over flow and the routing list on Carry over", async () => {
    setMockSearch("step=carry");
    renderReview();
    expect(await screen.findByRole("list", { name: "What happened to this week’s plan" })).toBeInTheDocument();
    expect(screen.getByText("Moved to next week")).toBeInTheDocument();
  });

  it("waits when the week has barely started", async () => {
    renderReview("1405-07-25");
    expect(await screen.findByRole("heading", { name: "Not enough week yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review last week" })).toHaveAttribute("href", `/personal/review/${WEEK}`);
    expect(screen.queryByRole("button", { name: "Save & exit" })).not.toBeInTheDocument();
  });

  it("speaks Persian", async () => {
    renderReview(WEEK, { preferences: { locale: "fa", direction: "rtl", digits: "fa" } });
    expect(screen.getByRole("heading", { level: 1, name: "این هفته" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { level: 2, name: "موفقیت‌ها" })).toBeInTheDocument();
  });
});
