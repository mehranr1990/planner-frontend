import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockRepositories } from "@/data/mock";
import type { Repositories } from "@/data/repositories";
import { taskDetailHref } from "@/features/personal/routes";
import { routerPush } from "@/test/setup";
import { ContextProbe, mockViewport, persian, readProbe, renderMyDay, type RenderMyDayOptions } from "../states/test-utils";
import { MyDayDndProvider } from "./my-day-dnd";
import { TimelineCard } from "./timeline-card";

const DAY = "2026-10-13";

function renderTimeline(options: RenderMyDayOptions & { footer?: boolean; emptyState?: boolean } = {}) {
  const { footer, emptyState, ...rest } = options;
  return renderMyDay(
    <MyDayDndProvider>
      <ContextProbe />
      <TimelineCard
        footer={footer ? <div data-testid="footer">capacity bar</div> : undefined}
        emptyState={emptyState ? <div data-testid="empty">Nothing planned yet</div> : undefined}
      />
    </MyDayDndProvider>,
    rest,
  );
}

const block = (id: string) => document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)!;
const blockButton = (id: string) => within(block(id)).getAllByRole("button")[0]!;
const blocks = () => [...document.querySelectorAll<HTMLElement>('[data-slot="time-block"]')];

beforeEach(() => mockViewport("desktop"));

describe("TimelineCard · desktop, normal day", () => {
  it("shows a loading skeleton, then the seven blocks of the board", async () => {
    renderTimeline();
    expect(screen.getByText("Loading your timeline").closest("[role=status]")).not.toBeNull();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(screen.getByRole("heading", { name: "Timeline" })).toBeInTheDocument();
    expect(screen.getByText("Drag tasks in from the right · drag edges to resize")).toBeInTheDocument();
  });

  it("draws hour labels from 08:00 to 20:00 on a 64px scale", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    const lines = document.querySelectorAll<HTMLElement>('[data-slot="hour-line"]');
    expect(lines).toHaveLength(13);
    expect(lines[0]).toHaveTextContent("08:00");
    expect(lines[12]).toHaveTextContent("20:00");
    expect(lines[1]!.style.top).toBe("64px");
    // Labels are LTR islands.
    expect(lines[0]!.querySelector("bdi")).toHaveAttribute("dir", "ltr");
    // 11:00 starts three hours in; the 45m review is 44px tall.
    expect(block("design-review").style.top).toBe("192px");
    expect(block("design-review").style.height).toBe("44px");
  });

  it("marks the live block with a 'Now · 14:35' chip and the now line", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(block("ui-design")).toHaveAttribute("data-current", "true");
    expect(within(block("ui-design")).getByText("Now").parentElement).toHaveTextContent("Now·14:35");
    expect(within(block("ui-design")).getByText("14:00 – 16:00")).toBeInTheDocument();
    expect(within(block("ui-design")).getByText(/35m left/)).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: "Now, 14:35" })).toHaveLength(1);
    expect(document.querySelectorAll('[data-slot="now-dot"]')).toHaveLength(1);
    // Only one block is live.
    expect(document.querySelectorAll('[data-current="true"]')).toHaveLength(1);
  });

  it("hatches completed blocks, strikes the title and says 'done'", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    const done = block("deep-work");
    expect(done).toHaveAttribute("data-done", "true");
    expect(within(done).getByText("Deep work · Planner design").parentElement?.className).toContain("line-through");
    expect(within(done).getByText(/Personal/)).toHaveTextContent(/· done$/);
    // Done blocks are not draggable and have no menu or resize handles.
    expect(within(done).queryByRole("button", { name: /Reschedule/ })).toBeNull();
    expect(done.querySelectorAll('[data-slot="resize-handle"]')).toHaveLength(0);
  });

  it("styles breaks neutrally and keeps them out of the scope tints", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(block("lunch")).toHaveAttribute("data-kind", "break");
    expect(blockButton("lunch").className).toContain("bg-subtle");
    expect(blockButton("client-call").className).toContain("bg-project-soft");
    expect(blockButton("design-review").className).not.toContain("bg-team-soft"); // done: hatched instead
    expect(blockButton("gym").className).toContain("bg-personal-soft");
  });

  it("puts short blocks on a single row and shows energy bars", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    // 30m = 28px.
    expect(block("client-call")).toHaveAttribute("data-short", "true");
    expect(block("ui-design")).not.toHaveAttribute("data-short");
    expect(block("gym").querySelector('[data-slot="energy-bars"]')).toHaveAttribute("data-level", "medium");
  });

  it("offers 'Drop a task here · 18:30' after the last block", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    const slot = document.querySelector('[data-slot="free-slot"]')!;
    expect(slot).toHaveTextContent("Drop a task here·18:30");
    expect(slot.className).toContain("border-dashed");
    expect(document.querySelectorAll('[data-slot="gap-hint"]')).toHaveLength(0);
  });

  it("makes the notch an 'Add block' action that opens Quick add", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    await userEvent.click(screen.getByRole("button", { name: "Add block" }));
    expect(routerPush).toHaveBeenCalledWith(expect.stringContaining("sheet=quick-add"), expect.anything());
  });

  it("switches between Day and 3 days through the my-day context", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    const group = screen.getByRole("radiogroup", { name: "Timeline view" });
    expect(within(group).getByRole("radio", { name: "Day" })).toBeChecked();
    await userEvent.click(within(group).getByRole("radio", { name: "3 days" }));
    await waitFor(() => expect(document.querySelectorAll('[data-slot="day-column"]')).toHaveLength(3));
    expect(within(group).getByRole("radio", { name: "3 days" })).toBeChecked();
  });

  it("renders the footer slot under the grid", async () => {
    renderTimeline({ footer: true });
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("describes the keyboard once for every block", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    const help = document.getElementById("my-day-block-help")!;
    expect(help).toHaveTextContent(/Press Space to lift/);
    expect(blockButton("gym").getAttribute("aria-describedby")).toContain("my-day-block-help");
  });
});

describe("TimelineCard · other days and states", () => {
  it("draws no now line or Now chip on another day", async () => {
    renderTimeline({ initialDay: "2026-10-14" });
    await waitFor(() => expect(blocks()).toHaveLength(2));
    expect(document.querySelector('[data-slot="now-line"]')).toBeNull();
    expect(document.querySelector('[data-current="true"]')).toBeNull();
  });

  it("shows the empty-state slot instead of the grid on an empty day", async () => {
    renderTimeline({ state: "empty", emptyState: true });
    expect(await screen.findByTestId("empty")).toBeInTheDocument();
    expect(document.querySelector('[data-slot="timeline-grid"]')).toBeNull();
    expect(document.querySelector('[data-slot="empty-drop-zone"]')).not.toBeNull();
  });

  it("falls back to an empty grid when no empty state is supplied", async () => {
    renderTimeline({ state: "empty" });
    await waitFor(() => expect(document.querySelector('[data-slot="timeline-grid"]')).not.toBeNull());
    expect(blocks()).toHaveLength(0);
  });

  it("hints at fitting tasks in the gaps of a partly planned day", async () => {
    renderTimeline({ state: "partial" });
    await waitFor(() => expect(document.querySelectorAll('[data-slot="gap-hint"]').length).toBeGreaterThan(0));
    const hints = [...document.querySelectorAll('[data-slot="gap-hint"]')].map((node) => node.textContent);
    expect(hints.some((text) => /free/.test(text ?? "") && /tasks? fits?/.test(text ?? ""))).toBe(true);
    expect(document.querySelector('[data-slot="free-slot"]')).toBeNull();
  });

  it("flags overlaps with text and a rose outline on a day over capacity", async () => {
    renderTimeline({ state: "overloaded" });
    await waitFor(() => expect(blocks().length).toBeGreaterThan(3));
    const flagged = blocks().filter((node) => node.hasAttribute("data-overlap"));
    expect(flagged.length).toBeGreaterThanOrEqual(2);
    for (const node of flagged) {
      expect(within(node).getByText(/overlaps 30m/)).toBeInTheDocument();
      expect(node.querySelector('[role="button"]')!.className).toContain("ring-danger");
    }
    expect(document.querySelector('[data-slot="free-slot"]')).toBeNull();
  });

  it("shows no current block when now falls in a gap", async () => {
    renderTimeline({ state: "no-current" });
    await waitFor(() => expect(blocks().length).toBeGreaterThan(3));
    expect(document.querySelector('[data-current="true"]')).toBeNull();
    expect(screen.getAllByRole("img", { name: "Now, 14:35" })).toHaveLength(1);
  });

  it("draws three day columns with headers in the 3-days view", async () => {
    renderTimeline({ initialView: "3days" });
    await waitFor(() => expect(document.querySelectorAll('[data-slot="day-column"]')).toHaveLength(3));
    const headers = document.querySelectorAll('[data-slot="day-header"]');
    expect(headers).toHaveLength(3);
    expect(headers[0]).toHaveAttribute("data-today", "true");
    expect(headers[0]).toHaveTextContent("Today");
    // Only today's column has a now line.
    expect(document.querySelectorAll('[data-slot="now-line"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-day="2026-10-14"] [data-slot="time-block"]')).toHaveLength(2);
  });

  it("offers a retry when the day cannot be loaded", { timeout: 14_000 }, async () => {
    const base = createMockRepositories();
    let failing = true;
    const repositories: Repositories = {
      ...base,
      blocks: {
        ...base.blocks,
        listForDay: (day) => (failing ? Promise.reject(new Error("offline")) : base.blocks.listForDay(day)),
      },
    };
    renderTimeline({ repositories });
    // The query retries three times with back-off before it gives up.
    const alert = await screen.findByRole("alert", {}, { timeout: 10_000 });
    expect(alert).toBeInTheDocument();
    failing = false;
    await userEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(blocks()).toHaveLength(7));
  });
});

describe("TimelineCard · below lg", () => {
  beforeEach(() => mockViewport("mobile"));

  it("is a plain card with a bounded scroller, 56px per hour and no notch or view switch", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(screen.queryByRole("button", { name: "Add block" })).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Timeline view" })).toBeNull();
    const scroller = document.querySelector<HTMLElement>('[data-slot="timeline-scroller"]')!;
    expect(scroller.className).toContain("overflow-y-auto");
    expect(scroller.className).toContain("overscroll-contain");
    expect(document.querySelectorAll<HTMLElement>('[data-slot="hour-line"]')[1]!.style.top).toBe(`${56}px`);
  });

  it("keeps the 3-days view to a single day", async () => {
    renderTimeline({ initialView: "3days" });
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(document.querySelectorAll('[data-slot="day-column"]')).toHaveLength(1);
  });
});

describe("TimeBlock interactions", () => {
  it("opens Reschedule with R, the right-click menu and the ⋯ button", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));

    blockButton("client-call").focus();
    await userEvent.keyboard("r");
    expect(readProbe().target).toEqual({ kind: "block", id: "client-call" });
    // Esc must be able to give focus back: the anchor is the focusable card, not its wrapper.
    expect(readProbe().anchorRole).toBe("button");

    // Right-click on another block retargets it.
    await userEvent.pointer({ keys: "[MouseRight]", target: blockButton("gym") });
    expect(readProbe().target).toEqual({ kind: "block", id: "gym" });

    await userEvent.click(within(block("lunch")).getByRole("button", { name: "Reschedule Lunch" }));
    expect(readProbe().target).toEqual({ kind: "block", id: "lunch" });
  });

  it("does not reschedule a done block", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    blockButton("deep-work").focus();
    await userEvent.keyboard("r");
    await userEvent.pointer({ keys: "[MouseRight]", target: blockButton("deep-work") });
    expect(readProbe().target).toBeNull();
  });

  it("opens task detail with Enter on a task block and selects any other block", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    blockButton("ui-design").focus();
    await userEvent.keyboard("{Enter}");
    expect(routerPush).toHaveBeenCalledWith(taskDetailHref("t-ui-design"));

    routerPush.mockClear();
    blockButton("gym").focus();
    await userEvent.keyboard("{Enter}");
    expect(routerPush).not.toHaveBeenCalled();
    expect(blockButton("gym")).toHaveAttribute("aria-pressed", "true");
    expect(block("gym")).toHaveAttribute("data-selected", "true");
    await userEvent.keyboard("{Enter}");
    expect(blockButton("gym")).toHaveAttribute("aria-pressed", "false");
  });

  it("gives every block an accessible name with time, duration, and state", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(blockButton("ui-design")).toHaveAccessibleName(/UI design · My Day screen, 14:00 – 16:00, 2h/);
    expect(blockButton("ui-design")).toHaveAccessibleName(/happening now/);
    expect(blockButton("ui-design")).toHaveAttribute("aria-current", "time");
    expect(blockButton("deep-work")).toHaveAccessibleName(/done/);
  });

  it("resizes with Shift+Arrow, shows the new length at once and saves it after a pause", async () => {
    const { repositories } = renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    const before = parseFloat(block("gym").style.height);
    blockButton("gym").focus();
    await userEvent.keyboard("{Shift>}{ArrowDown}{ArrowDown}{/Shift}");
    // 60m -> 90m: 30 minutes more at 64px per hour.
    await waitFor(() => expect(parseFloat(block("gym").style.height)).toBeCloseTo(before + 32, 1));
    await waitFor(
      async () => {
        const saved = (await repositories.blocks.listForDay(DAY)).find((item) => item.id === "gym")!;
        expect(new Date(saved.end).getTime() - new Date(saved.start).getTime()).toBe(90 * 60_000);
      },
      { timeout: 3000 },
    );
  });

  it("never resizes below 15 minutes", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    blockButton("gym").focus();
    for (let index = 0; index < 8; index += 1) await userEvent.keyboard("{Shift>}{ArrowUp}{/Shift}");
    // 15m is 17px - 4px = 13px, held at the 24px tap minimum.
    await waitFor(() => expect(parseFloat(block("gym").style.height)).toBe(24));
  });
});

describe("keyboard drag", () => {
  it("lifts with Space, moves 15 minutes per arrow, drops with Enter and announces it", async () => {
    const { repositories } = renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    blockButton("gym").focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(document.querySelector('[data-slot="drag-overlay-card"]')).not.toBeNull());
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    await waitFor(
      async () => {
        const moved = (await repositories.blocks.listForDay(DAY)).find((item) => item.id === "gym")!;
        expect(moved.start).toContain("T17:45");
      },
      { timeout: 3000 },
    );
    await waitFor(() => expect(document.querySelector('[data-slot="my-day-live-region"]')).toHaveTextContent(/Gym moved to 17:45/));
  });

  it("cancels with Escape and leaves the block alone", async () => {
    const { repositories } = renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    blockButton("gym").focus();
    await userEvent.keyboard(" ");
    await userEvent.keyboard("{ArrowDown}{Escape}");
    await waitFor(() => expect(document.querySelector('[data-slot="my-day-live-region"]')).toHaveTextContent(/Cancelled/));
    const gym = (await repositories.blocks.listForDay(DAY)).find((item) => item.id === "gym")!;
    expect(gym.start).toContain("T17:15");
    expect(document.querySelector('[data-slot="drag-overlay-card"]')).toBeNull();
  });

  it("does not lift a done block", async () => {
    renderTimeline();
    await waitFor(() => expect(blocks()).toHaveLength(7));
    blockButton("deep-work").focus();
    await userEvent.keyboard(" ");
    expect(document.querySelector('[data-slot="drag-overlay-card"]')).toBeNull();
  });
});

describe("TimelineCard · Persian", () => {
  it("speaks Persian with Persian digits, RTL, and keeps clock values as LTR islands", async () => {
    renderTimeline({ preferences: persian });
    await waitFor(() => expect(blocks()).toHaveLength(7));
    expect(screen.getByRole("heading", { name: "خط زمان" })).toBeInTheDocument();
    const lines = document.querySelectorAll('[data-slot="hour-line"]');
    expect(lines[0]).toHaveTextContent("۰۸:۰۰");
    expect(within(block("ui-design")).getByText(/الان/).parentElement).toHaveTextContent("۱۴:۳۵");
    for (const bdi of block("ui-design").querySelectorAll("bdi[dir=ltr]")) {
      expect(bdi.className).toContain("tabular-nums");
    }
    expect(document.querySelector('[data-slot="free-slot"]')).toHaveTextContent("۱۸:۳۰");
    // Layout is logical: the label column sits at inline-start.
    expect(lines[0]!.querySelector("span")!.className).toContain("start-0");
  });
});

