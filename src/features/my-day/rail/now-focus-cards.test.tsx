import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { personalFixtures } from "@/fixtures/personal";
import { routerPush } from "@/test/setup";
import { FocusCard } from "./focus-card";
import { NowCard } from "./now-card";
import { renderRail } from "./test-utils";

afterEach(() => resetToasts());

const NO_BLOCKS = { fixtures: { blocks: [] } } as const;
/** The same day with the running block already finished: nothing live, Client call next. */
const IDLE = {
  fixtures: { blocks: personalFixtures.blocks.map((block) => (block.id === "ui-design" ? { ...block, done: true } : block)) },
} as const;

describe("NowCard", () => {
  it("is the volt card while a block runs: chip, range, title, meta, progress, Start focus, Next", async () => {
    renderRail(<NowCard />);
    await screen.findByText("Now · 35m left");
    const card = screen.getByRole("region", { name: "Now" });

    expect(within(card).getByText("Now · 35m left")).toBeInTheDocument();
    expect(within(card).getByText("14:00 – 16:00").closest("[dir=ltr]")).not.toBeNull();
    expect(within(card).getByRole("heading", { level: 2, name: "UI design · My Day screen" })).toBeInTheDocument();
    expect(card.textContent).toContain("Personal · Planner side project · high energy");
    const progress = within(card).getByRole("progressbar", { name: "Progress" });
    expect(progress).toHaveAttribute("aria-valuenow", "71");

    const focus = within(card).getByRole("link", { name: "Start focus · 25m" });
    expect(focus).toHaveAttribute("href", "/personal/focus?task=t-ui-design");
    expect(card.textContent).toContain("Next · 16:30 Client call (Projects) · 17:15 Gym");

    // Volt is for live only, and the notch holds exactly one real action.
    expect(card.querySelector("[data-slot=signature-surface]")?.className).toContain("bg-volt");
    expect(card.querySelectorAll("[data-slot=notch-action] button")).toHaveLength(1);
    expect(within(card).getByRole("button", { name: "Mark done" })).toBeInTheDocument();
  });

  it("Mark done finishes the block, offers Undo, and the card stops being volt", async () => {
    const user = userEvent.setup();
    renderRail(<NowCard />);
    await screen.findByText("Now · 35m left");
    await user.click(screen.getByRole("button", { name: "Mark done" }));

    // Nothing runs any more: the plain "Up next" card replaces the volt one.
    await screen.findByText("Up next · 16:30");
    const card = screen.getByRole("region", { name: "Now" });
    expect(card.querySelector("[data-slot=signature-surface]")?.className).not.toContain("bg-volt");

    const toast = await screen.findByText("Marked done");
    expect(toast.closest("[data-tone]")).toHaveAttribute("data-tone", "success");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("Now · 35m left")).toBeInTheDocument();
  });

  it("is hidden on any day but today", () => {
    const { container } = renderRail(<NowCard />, { provider: { initialDay: "2026-10-14" } });
    expect(container.querySelector("section")).toBeNull();
    expect(screen.queryByRole("region", { name: "Now" })).toBeNull();
  });

  it("Up next with a task picker when nothing runs; the notch is Start focus", async () => {
    const user = userEvent.setup();
    renderRail(<NowCard />, { mock: IDLE });
    await screen.findByText("Up next · 16:30");
    const card = screen.getByRole("region", { name: "Now" });
    expect(within(card).queryByRole("progressbar")).toBeNull();

    // Below lg the picker is a bottom sheet listing the day's open tasks.
    await user.click(within(card).getByRole("button", { name: "Start focus" }));
    const dialog = await screen.findByRole("dialog", { name: "Focus on which task?" });
    await user.click(await within(dialog).findByRole("button", { name: /Review October expenses/ }));
    expect(routerPush).toHaveBeenCalledWith("/personal/focus?task=t-review-october-expenses");
  });

  it("says so when the day has nothing running or planned", async () => {
    renderRail(<NowCard />, { mock: NO_BLOCKS });
    expect(await screen.findByRole("heading", { name: "Nothing running" })).toBeInTheDocument();
    expect(screen.getByText("Pick a task to focus on, or plan your next block.")).toBeInTheDocument();
  });

  it("shows a loading frame first", async () => {
    renderRail(<NowCard />, { mock: { latencyMs: 40 } });
    const card = screen.getByRole("region", { name: "Now" });
    expect(within(card).getByRole("status")).toHaveTextContent("Loading…");
    expect(within(card).getByRole("button", { name: "Mark done" })).toBeDisabled();
    expect(await screen.findByText("Now · 35m left")).toBeInTheDocument();
  });

  it("reports a failed load and retries from the notch", async () => {
    const user = userEvent.setup();
    const { createMockRepositories } = await import("@/data/mock");
    const repositories = createMockRepositories();
    let fail = true;
    const listForDay = repositories.blocks.listForDay.bind(repositories.blocks);
    repositories.blocks.listForDay = async (day) => {
      if (fail) throw new Error("offline");
      return listForDay(day);
    };
    renderRail(<NowCard />, { repositories });
    expect(await screen.findByText("Couldn’t load today’s plan", undefined, { timeout: 8000 })).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Now · 35m left")).toBeInTheDocument();
  }, 20_000);

  it("speaks Persian with Persian digits and an LTR clock island", async () => {
    renderRail(<NowCard />, { preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } });
    await screen.findByRole("progressbar");
    const card = screen.getByRole("region", { name: "الان" });
    expect(within(card).getByText(/الان · .*۳۵.* مانده/)).toBeInTheDocument();
    expect(within(card).getByText("۱۴:۰۰ – ۱۶:۰۰").closest("[dir=ltr]")).not.toBeNull();
    expect(within(card).getByRole("button", { name: "انجام شد" })).toBeInTheDocument();
    expect(within(card).getByRole("progressbar")).toHaveAttribute("aria-valuetext", "۷۱٪");
    // The title is a bidi island of its own.
    expect(within(card).getByRole("heading", { level: 2 }).querySelector("bdi")).toHaveAttribute("dir", "auto");
  });
});

describe("FocusCard", () => {
  it("shows the Pomodoro setting and today's sessions", async () => {
    renderRail(<FocusCard />);
    const card = screen.getByRole("region", { name: "Focus" });
    expect(within(card).getByRole("heading", { name: "Focus · Pomodoro" })).toBeInTheDocument();
    expect(within(card).getByText("25:00").closest("[dir=ltr]")).not.toBeNull();
    expect(await within(card).findByText("25 / 5 · cycle 1 of 4 · 2 sessions done today")).toBeInTheDocument();
    expect(card.querySelector("[data-slot=signature-surface]")?.className).toContain("bg-scope-soft");
    expect(card.querySelectorAll("[data-slot=notch-action] button")).toHaveLength(1);
  });

  it("starts focus on the running block's task", async () => {
    const user = userEvent.setup();
    renderRail(<FocusCard />);
    // The block loads after the card renders; the first click would open the picker.
    await waitFor(async () => {
      routerPush.mockClear();
      await user.click(screen.getByRole("button", { name: "Start focus" }));
      // A click before the block loaded opened the picker: close it so the next attempt can reach the button.
      if (routerPush.mock.calls.length === 0) await user.keyboard("{Escape}");
      expect(routerPush).toHaveBeenCalledWith("/personal/focus?task=t-ui-design");
    });
  });

  it("asks which task when nothing task-shaped runs (popover on desktop)", async () => {
    const user = userEvent.setup();
    renderRail(<FocusCard />, { mock: NO_BLOCKS, desktop: true });
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    const picker = await screen.findByRole("dialog", { name: "Focus on which task?" });
    const list = await within(picker).findByRole("list", { name: "Open tasks for today" });
    expect(within(list).getAllByRole("button").length).toBeGreaterThan(2);
    await user.click(within(picker).getByRole("button", { name: "Focus without a task" }));
    expect(routerPush).toHaveBeenCalledWith("/personal/focus");
  });

  it("the picker is a bottom sheet below lg and says when there is nothing to pick", async () => {
    const user = userEvent.setup();
    renderRail(<FocusCard />, { mock: { fixtures: { blocks: [], tasks: [] } }, desktop: false });
    await user.click(screen.getByRole("button", { name: "Start focus" }));
    const dialog = await screen.findByRole("dialog", { name: "Focus on which task?" });
    expect(dialog).toHaveAttribute("data-side", "bottom");
    expect(await within(dialog).findByText("No open tasks today")).toBeInTheDocument();
  });

  it("speaks Persian with Persian digits", async () => {
    renderRail(<FocusCard />, { preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } });
    const card = screen.getByRole("region", { name: "تمرکز" });
    expect(within(card).getByText("۲۵:۰۰").closest("[dir=ltr]")).not.toBeNull();
    expect(await within(card).findByText("۲۵ / ۵ · دور ۱ از ۴ · ۲ جلسه‌ی انجام‌شده امروز")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "شروع تمرکز" })).toBeInTheDocument();
  });
});
