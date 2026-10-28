import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { myDayStateFixtures } from "@/fixtures/personal/my-day-states";
import { dismiss } from "@/components/ui/toast";
import { routerPush } from "@/test/setup";
import { ContextProbe, persian, renderMyDay } from "./test-utils";
import { EmptyDayState } from "./empty-day-state";

afterEach(() => dismiss());

describe("EmptyDayState", () => {
  it("says Nothing planned yet with the day's own numbers: 8h free, five tasks waiting", async () => {
    renderMyDay(<EmptyDayState />, { state: "empty" });
    expect(screen.getByRole("heading", { name: "Nothing planned yet" })).toBeInTheDocument();
    expect(
      await screen.findByText(
        "You have 8h free today and 5 tasks waiting. Start with your top 3 or pull from Unscheduled.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pick top 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add block" })).toBeInTheDocument();
  });

  it("reads other days in the third person: no 'today'", async () => {
    renderMyDay(<EmptyDayState />, { state: "empty", initialDay: "2026-10-20" });
    expect(await screen.findByText(/You have 8h free on this day/)).toBeInTheDocument();
  });

  it("Pick top 3 ranks the best tasks into the day's priorities and confirms with a toast", async () => {
    const user = userEvent.setup();
    const { repositories } = renderMyDay(<EmptyDayState />, { state: "empty" });
    await screen.findByText(/tasks waiting/);
    await user.click(screen.getByRole("button", { name: "Pick top 3" }));

    expect(await screen.findByText("Top 3 set for the day")).toBeInTheDocument();
    const priorities = await repositories.plan.priorities("2026-10-13");
    expect(priorities).toHaveLength(3);
    expect(priorities.map((entry) => entry.rank)).toEqual([1, 2, 3]);
  });

  it("tells the person when there is nothing to pick from", async () => {
    const user = userEvent.setup();
    const repositories = createMockRepositories({ fixtures: { ...myDayStateFixtures("empty"), tasks: [] } });
    renderMyDay(<EmptyDayState />, { repositories });
    await user.click(await screen.findByRole("button", { name: "Pick top 3" }));
    expect(await screen.findByText("No open tasks to pick from")).toBeInTheDocument();
    await expect(repositories.plan.priorities("2026-10-13")).resolves.toEqual([]);
  });

  it("Add block opens the quick-add sheet", async () => {
    const user = userEvent.setup();
    renderMyDay(<EmptyDayState />, { state: "empty" });
    await user.click(screen.getByRole("button", { name: "Add block" }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("sheet=quick-add"), { scroll: false });
  });

  it("is Persian with Persian digits", async () => {
    renderMyDay(
      <>
        <EmptyDayState />
        <ContextProbe />
      </>,
      { state: "empty", preferences: persian },
    );
    expect(screen.getByRole("heading", { name: "هنوز برنامه‌ای نیست" })).toBeInTheDocument();
    const region = screen.getByRole("region", { name: "هنوز برنامه‌ای نیست" });
    await waitFor(() => expect(within(region).getByText(/۵ کار منتظر است/)).toBeInTheDocument());
    expect(within(region).getByText(/۸ ساعت وقت آزاد/)).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "انتخاب ۳ اولویت" })).toBeInTheDocument();
  });
});
