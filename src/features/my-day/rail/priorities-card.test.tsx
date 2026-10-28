import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import { PrioritiesCard } from "./priorities-card";
import { renderRail } from "./test-utils";

describe("PrioritiesCard", () => {
  it("lists the three ranked priorities with their state, energy and a count", async () => {
    renderRail(<PrioritiesCard />);
    const card = screen.getByRole("region", { name: "Priorities" });
    const list = await within(card).findByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    expect(within(card).getByText("3 for today")).toBeInTheDocument();
    expect(rows[0]!.textContent).toContain("UI design · My Day screen");
    expect(rows[0]!.textContent).toContain("Scheduled · 14:00");
    expect(rows[1]!.textContent).toContain("Gym");
    expect(rows[1]!.textContent).toContain("Scheduled · 17:15");
    expect(rows[2]!.textContent).toContain("Review October expenses");
    expect(rows[2]!.textContent).toContain("Unscheduled · 30m");

    expect(within(rows[0]!).getByRole("img", { name: "Energy high" })).toBeInTheDocument();
    expect(within(rows[1]!).getByRole("img", { name: "Energy medium" })).toBeInTheDocument();
    expect(within(rows[2]!).getByRole("img", { name: "Energy medium" })).toBeInTheDocument();

    // Rank 1 is the filled circle; the rank is text, not just colour.
    expect(within(rows[0]!).getByRole("img", { name: "Priority 1" }).className).toContain("bg-primary");
    expect(within(rows[1]!).getByRole("img", { name: "Priority 2" }).className).not.toContain("bg-primary");
  });

  it("task rows open the task; the gym block is a plain row", async () => {
    renderRail(<PrioritiesCard />);
    const links = await screen.findAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/personal/tasks/t-ui-design",
      "/personal/tasks/t-review-october-expenses",
    ]);
    expect(screen.getByText("Gym").closest("a")).toBeNull();
  });

  it("is a product card: no notch", () => {
    renderRail(<PrioritiesCard />);
    const card = screen.getByRole("region", { name: "Priorities" });
    expect(card).toHaveAttribute("data-slot", "product-card");
    expect(card.querySelector("[data-slot=notch-action]")).toBeNull();
  });

  it("shows a loading state first", () => {
    renderRail(<PrioritiesCard />, { mock: { latencyMs: 30 } });
    expect(within(screen.getByRole("region", { name: "Priorities" })).getByRole("status")).toHaveTextContent("Loading priorities…");
  });

  it("explains an empty day", async () => {
    renderRail(<PrioritiesCard />, { mock: { fixtures: { priorities: {} } } });
    expect(await screen.findByText("No priorities yet")).toBeInTheDocument();
    expect(screen.getByText("Choose up to three things that matter most today.")).toBeInTheDocument();
    expect(screen.queryByText(/for today/)).toBeNull();
  });

  it("reports an error and retries", async () => {
    const repositories = createMockRepositories();
    let fail = true;
    const priorities = repositories.plan.priorities.bind(repositories.plan);
    repositories.plan.priorities = async (day) => {
      if (fail) throw new Error("offline");
      return priorities(day);
    };
    renderRail(<PrioritiesCard />, { repositories });
    expect(await screen.findByRole("alert", undefined, { timeout: 8000 })).toHaveTextContent("Couldn’t load priorities");
    fail = false;
    screen.getByRole("button", { name: "Retry" }).click();
    expect(await screen.findByText("Unscheduled · 30m")).toBeInTheDocument();
  }, 20_000);

  it("uses Persian copy and digits, with titles as bidi islands", async () => {
    renderRail(<PrioritiesCard />, { preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } });
    const card = screen.getByRole("region", { name: "اولویت‌ها" });
    expect(await within(card).findByText("۳ مورد برای امروز")).toBeInTheDocument();
    expect(within(card).getByText("زمان‌بندی‌شده · ۱۴:۰۰")).toBeInTheDocument();
    expect(within(card).getByText(/بدون زمان · .*۳۰/)).toBeInTheDocument();
    expect(within(card).getByRole("img", { name: "اولویت ۱" })).toBeInTheDocument();
    expect(card.querySelector("bdi")).toHaveAttribute("dir", "auto");
  });
});
