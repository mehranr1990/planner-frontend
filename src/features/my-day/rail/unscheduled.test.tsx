import { useDndContext, useDraggable, type DragStartEvent } from "@dnd-kit/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { resetToasts } from "@/components/ui/toast";
import { createMockRepositories } from "@/data/mock";
import { useBlocks } from "@/data/queries";
import { blockDragData, blockDragId, taskDragData } from "../drag";
import { renderRail } from "./test-utils";
import { UnscheduledCard } from "./unscheduled-card";
import { UnscheduledTray } from "./unscheduled-tray";

afterEach(() => resetToasts());

const FA = { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" } as const;

const titles = (list: HTMLElement) => within(list).getAllByRole("listitem").map((row) => row.textContent ?? "");

async function loadedList() {
  return await screen.findByRole("list", { name: "Unscheduled tasks" });
}

describe("UnscheduledCard", () => {
  it("shows the summary, the pills and the four tasks of the board", async () => {
    renderRail(<UnscheduledCard />);
    const card = screen.getByRole("region", { name: "Unscheduled" });
    const list = await loadedList();

    expect(within(card).getByText("4 tasks · 2h 05m")).toBeInTheDocument();
    expect(card).toHaveAttribute("data-slot", "product-card");
    expect(card.querySelector("[data-slot=notch-action]")).toBeNull();

    const rows = titles(list);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toContain("Pay electricity bill");
    expect(rows[0]).toContain("10m");
    expect(rows.join("|")).toContain("Plan weekend trip");
    expect(rows.find((row) => row.includes("Plan weekend trip"))).toContain("1h 05m");

    const pills = within(card).getByRole("radiogroup", { name: "Filter unscheduled tasks" });
    expect(within(pills).getByRole("radio", { name: "Today" })).toBeChecked();
    expect(within(pills).getByRole("radio", { name: "Overdue 1" })).toBeInTheDocument();
    expect(within(pills).getByRole("radio", { name: "This week" })).toBeInTheDocument();
    expect(card.textContent).toContain("Tip: drop on a free slot or press S to auto-fit into the next free gap.");
    expect(card.querySelector("kbd")).toHaveTextContent("S");
  });

  it("marks the overdue task in text as well as colour, and shows energy bars", async () => {
    renderRail(<UnscheduledCard />);
    const list = await loadedList();
    const overdue = within(list).getByText("Pay electricity bill").closest("li")!;
    expect(within(overdue).getByText("Overdue")).toHaveClass("sr-only");
    expect(overdue.querySelector(".bg-danger")).not.toBeNull();
    expect(within(overdue).getByRole("img", { name: "Energy low" })).toBeInTheDocument();
  });

  it("the pills switch the list: Overdue, This week", async () => {
    const user = userEvent.setup();
    renderRail(<UnscheduledCard />);
    await loadedList();
    await user.click(screen.getByRole("radio", { name: "Overdue 1" }));
    await waitFor(() => expect(titles(screen.getByRole("list", { name: "Unscheduled tasks" }))).toHaveLength(1));
    expect(screen.getByText("1 task · 10m")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "This week" }));
    expect(await screen.findByText("Renew car insurance")).toBeInTheDocument();
  });

  it("the energy filter reorders and mutes tasks that need more energy (nothing is hidden)", async () => {
    renderRail(<UnscheduledCard />, {
      mock: {
        fixtures: {
          tasks: [
            { id: "hard", title: "Hard thing", scope: "personal", priority: "urgent", energy: "high", durationMinutes: 60, date: "2026-10-13", time: null, status: "open" },
            { id: "easy", title: "Easy thing", scope: "personal", priority: "low", energy: "low", durationMinutes: 10, date: "2026-10-13", time: null, status: "open" },
          ],
          blocks: [],
        },
      },
      provider: { initialEnergy: "low" },
    });
    const list = await loadedList();
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Easy thing");
    expect(rows[1]).toHaveTextContent("Hard thing");

    const hard = within(rows[1]!).getByRole("button");
    expect(hard).toHaveAttribute("data-exceeds-energy", "true");
    expect(hard).toHaveAttribute("title", "Needs high energy");
    expect(within(hard).getByText("Needs high energy")).toHaveClass("sr-only");
    expect(within(rows[0]!).getByRole("button")).not.toHaveAttribute("data-exceeds-energy");
  });

  it("rows are dnd-kit draggables with the contract id and payload; the card is the `unscheduled` drop zone", async () => {
    const user = userEvent.setup();
    const started: DragStartEvent[] = [];
    let droppables: string[] = [];
    function Probe() {
      droppables = [...useDndContext().droppableContainers.getEnabled().map((container) => String(container.id))];
      return null;
    }
    renderRail(
      <>
        <Probe />
        <UnscheduledCard />
      </>,
      { onDragStart: (event) => started.push(event) },
    );
    const list = await loadedList();
    const row = within(list).getByText("Review October expenses").closest("[role=button]") as HTMLElement;
    expect(row).toHaveAttribute("aria-roledescription", "draggable");
    expect(row.className).toContain("cursor-grab");

    row.focus();
    await user.keyboard(" ");
    await waitFor(() => expect(started).toHaveLength(1));
    expect(started[0]!.active.id).toBe("task:t-review-october-expenses");
    expect(started[0]!.active.data.current).toEqual(
      taskDragData({ id: "t-review-october-expenses", title: "Review October expenses", durationMinutes: 30, energy: "medium" }),
    );
    expect(droppables).toContain("unscheduled");
  });

  it("lights up as a drop zone while a task block is dragged over, but not for an event", async () => {
    const user = userEvent.setup();
    function BlockHandle({ id, taskId }: { id: string; taskId?: string }) {
      const { setNodeRef, attributes, listeners } = useDraggable({
        id: blockDragId(id),
        data: blockDragData({ id, taskId, durationMinutes: 30 }),
      });
      return (
        <button ref={setNodeRef} {...attributes} {...listeners}>
          {`block ${id}`}
        </button>
      );
    }
    const { container } = renderRail(
      <>
        <BlockHandle id="task-block" taskId="t-1" />
        <BlockHandle id="event-block" />
        <UnscheduledCard />
      </>,
    );
    await loadedList();
    const zone = container.querySelector("[data-slot=unscheduled-zone]") as HTMLElement;
    expect(zone).not.toHaveAttribute("data-drop-ready");

    screen.getByRole("button", { name: "block event-block" }).focus();
    await user.keyboard(" ");
    expect(zone).not.toHaveAttribute("data-drop-ready");
    await user.keyboard("{Escape}");

    screen.getByRole("button", { name: "block task-block" }).focus();
    await user.keyboard(" ");
    await waitFor(() => expect(zone).toHaveAttribute("data-drop-ready", "true"));
    expect(screen.getByText("Drop here to take it off the timeline")).toBeInTheDocument();
  });

  it("S auto-fits the selected row into the next free gap, with Undo", async () => {
    const user = userEvent.setup();
    function Blocks() {
      const blocks = useBlocks("2026-10-13");
      return <p data-testid="titles">{(blocks.data ?? []).map((block) => block.title).join("|")}</p>;
    }
    renderRail(
      <>
        <Blocks />
        <UnscheduledCard />
      </>,
    );
    const list = await loadedList();
    await user.click(within(list).getByText("Review October expenses"));
    await user.keyboard("s");

    expect(await screen.findByText(/^Scheduled for \d\d:\d\d$/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("titles").textContent).toContain("Review October expenses"));
    await waitFor(() => expect(titles(screen.getByRole("list", { name: "Unscheduled tasks" })).join("|")).not.toContain("Review October expenses"));

    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(screen.getByTestId("titles").textContent).not.toContain("Review October expenses"));
  });

  it("S does nothing while typing in a field, or with no row selected", async () => {
    const user = userEvent.setup();
    const repositories = createMockRepositories();
    const before = (await repositories.blocks.listForDay("2026-10-13")).length;
    renderRail(
      <>
        <input aria-label="Notes" />
        <UnscheduledCard />
      </>,
      { repositories },
    );
    const list = await loadedList();
    await user.keyboard("s");
    await user.click(within(list).getByText("Review October expenses"));
    await user.click(screen.getByRole("textbox", { name: "Notes" }));
    await user.keyboard("s");
    expect((await repositories.blocks.listForDay("2026-10-13")).length).toBe(before);
    expect(screen.queryByText(/^Scheduled for/)).toBeNull();
  });

  it("says when there is nothing unscheduled", async () => {
    renderRail(<UnscheduledCard />, { mock: { fixtures: { tasks: [], blocks: [] } } });
    expect(await screen.findByText("Nothing unscheduled")).toBeInTheDocument();
    expect(screen.getByText("0 tasks · 0m")).toBeInTheDocument();
  });

  it("shows loading rows first", () => {
    renderRail(<UnscheduledCard />, { mock: { latencyMs: 30 } });
    expect(within(screen.getByRole("region", { name: "Unscheduled" })).getByRole("status")).toHaveTextContent("Loading tasks…");
  });

  it("reports an error and retries", async () => {
    const repositories = createMockRepositories();
    let fail = true;
    const listUnscheduled = repositories.tasks.listUnscheduled.bind(repositories.tasks);
    repositories.tasks.listUnscheduled = async (query) => {
      if (fail) throw new Error("offline");
      return listUnscheduled(query);
    };
    const user = userEvent.setup();
    renderRail(<UnscheduledCard />, { repositories });
    expect(await screen.findByRole("alert", undefined, { timeout: 8000 })).toHaveTextContent("Couldn’t load tasks");
    fail = false;
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("list", { name: "Unscheduled tasks" })).toBeInTheDocument();
  }, 20_000);

  it("speaks Persian with Persian digits", async () => {
    renderRail(<UnscheduledCard />, { preferences: FA });
    const card = screen.getByRole("region", { name: "بدون زمان" });
    await screen.findByRole("list", { name: "کارهای بدون زمان" });
    expect(within(card).getByText(/^۴ کار · /)).toBeInTheDocument();
    expect(within(card).getByRole("radio", { name: "عقب‌افتاده ۱" })).toBeInTheDocument();
    expect(card.querySelector("kbd")).toHaveTextContent("S");
    expect(card.querySelector("bdi")).toHaveAttribute("dir", "auto");
  });

  it("only the copy that is on screen takes part in dragging", async () => {
    const { unmount } = renderRail(<UnscheduledCard />, { desktop: false });
    let list = await loadedList();
    expect(within(list).getAllByRole("button")[0]).toHaveAttribute("aria-disabled", "true");
    unmount();
    renderRail(<UnscheduledCard />, { desktop: true });
    list = await loadedList();
    expect(within(list).getAllByRole("button")[0]).toHaveAttribute("aria-disabled", "false");
  });
});

describe("UnscheduledTray", () => {
  it("is a collapsed 48px header: count, long-press hint, aria-expanded", async () => {
    renderRail(<UnscheduledTray />, { desktop: false });
    const header = await screen.findByRole("button", { name: /Unscheduled · 4/ });
    expect(header).toHaveTextContent("long-press & drag up");
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(header.className).toContain("min-h-12");
    expect(screen.queryByRole("list", { name: "Unscheduled tasks" })).toBeNull();
    // The controlled region exists even while collapsed.
    expect(document.getElementById(header.getAttribute("aria-controls")!)).not.toBeNull();
  });

  it("expands to the pills and the same rows, and collapses again", async () => {
    const user = userEvent.setup();
    renderRail(<UnscheduledTray />, { desktop: false });
    const header = await screen.findByRole("button", { name: /Unscheduled · 4/ });
    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "true");
    const list = await loadedList();
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("radiogroup", { name: "Filter unscheduled tasks" })).toBeInTheDocument();
    expect(within(list).getAllByRole("button")[0]).toHaveAttribute("aria-disabled", "false");
    expect(within(list).getAllByRole("button")[0]!.className).toContain("touch-pan-y");

    await user.click(header);
    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list", { name: "Unscheduled tasks" })).toBeNull();
  });

  it("is not draggable on desktop, where the card takes over", async () => {
    const user = userEvent.setup();
    renderRail(<UnscheduledTray />, { desktop: true });
    await user.click(await screen.findByRole("button", { name: /Unscheduled · 4/ }));
    const list = await loadedList();
    expect(within(list).getAllByRole("button")[0]).toHaveAttribute("aria-disabled", "true");
  });

  it("speaks Persian with Persian digits", async () => {
    renderRail(<UnscheduledTray />, { desktop: false, preferences: FA });
    const header = await screen.findByRole("button", { name: /بدون زمان · ۴/ });
    expect(header).toHaveTextContent("نگه دارید و بکشید بالا");
  });
});
