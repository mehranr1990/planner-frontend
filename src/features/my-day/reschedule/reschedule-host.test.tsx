import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dismiss } from "@/components/ui/toast";
import { useMyDay, type RescheduleOpenOptions, type RescheduleTarget } from "../my-day-context";
import { ContextProbe, mockViewport, persian, renderMyDay, type RenderMyDayOptions } from "../states/test-utils";
import { RescheduleHost } from "./reschedule-host";

function Launcher({ target, options }: { target: RescheduleTarget; options?: RescheduleOpenOptions }) {
  const { openReschedule } = useMyDay();
  return (
    <button type="button" onClick={(event) => openReschedule(target, event.currentTarget, options)}>
      Open reschedule
    </button>
  );
}

function setup(target: RescheduleTarget, render: RenderMyDayOptions = {}, options?: RescheduleOpenOptions) {
  return renderMyDay(
    <>
      <Launcher target={target} options={options} />
      <RescheduleHost />
      <ContextProbe />
    </>,
    render,
  );
}

const UI_DESIGN: RescheduleTarget = { kind: "block", id: "ui-design" };

afterEach(() => {
  // The toast store is module-level: clear it between tests.
  act(() => dismiss());
});

describe("RescheduleHost on desktop", () => {
  beforeEach(() => mockViewport("desktop"));

  it("renders nothing until a request is open", () => {
    setup(UI_DESIGN);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a titled popover with the suggestion rows, the first one selected and focused", async () => {
    const user = userEvent.setup();
    setup(UI_DESIGN);
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));

    const dialog = await screen.findByRole("dialog", { name: /Reschedule/ });
    expect(within(dialog).getByRole("heading", { name: "Reschedule “UI design · My Day screen”" })).toBeInTheDocument();
    const menu = await within(dialog).findByRole("menu", { name: "Reschedule options" });
    const rows = within(menu).getAllByRole("menuitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/^Tomorrow · 10:30/),
      expect.stringMatching(/^Pick date & time…/),
      expect.stringMatching(/^Back to Unscheduled/),
    ]);
    expect(within(menu).getByText("best fit")).toBeInTheDocument();
    expect(rows[0]).toHaveAttribute("data-active");
    await waitFor(() => expect(rows[0]).toHaveFocus());
    expect(within(dialog).getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("moves with the arrow keys (roving tabindex) and Esc closes and returns focus to the opener", async () => {
    const user = userEvent.setup();
    setup(UI_DESIGN);
    const opener = screen.getByRole("button", { name: "Open reschedule" });
    await user.click(opener);
    const menu = await screen.findByRole("menu");
    const rows = within(menu).getAllByRole("menuitem");
    await waitFor(() => expect(rows[0]).toHaveFocus());

    await user.keyboard("{ArrowDown}");
    expect(rows[1]).toHaveFocus();
    expect(rows[1]).toHaveAttribute("tabindex", "0");
    expect(rows[0]).toHaveAttribute("tabindex", "-1");
    await user.keyboard("{End}");
    expect(rows[2]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(rows[0]).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(opener).toHaveFocus();
  });

  it("applies Tomorrow, closes, and offers one Undo that puts the block back", async () => {
    const user = userEvent.setup();
    const { repositories } = setup(UI_DESIGN);
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Tomorrow/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    const moved = await repositories.blocks.listForDay("2026-10-14");
    expect(moved.map((block) => block.id)).toContain("ui-design");
    expect(await screen.findByText(/Moved “.*UI design · My Day screen.*” to tomorrow at 10:30/)).toBeInTheDocument();

    await user.click(await screen.findByRole("button", { name: "Undo" }));
    await waitFor(async () => {
      const today = await repositories.blocks.listForDay("2026-10-13");
      expect(today.map((block) => block.id)).toContain("ui-design");
    });
    expect((await repositories.blocks.listForDay("2026-10-14")).map((block) => block.id)).not.toContain("ui-design");
  });

  it("sends a task block back to Unscheduled", async () => {
    const user = userEvent.setup();
    const { repositories } = setup(UI_DESIGN);
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Back to Unscheduled/ }));
    await waitFor(async () => {
      const today = await repositories.blocks.listForDay("2026-10-13");
      expect(today.map((block) => block.id)).not.toContain("ui-design");
    });
    expect(await screen.findByText(/is back in Unscheduled/)).toBeInTheDocument();
  });

  it("offers Later today with its free time when the block fits, and moves it there", async () => {
    const user = userEvent.setup();
    const { repositories } = setup({ kind: "block", id: "client-call" });
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    const later = await screen.findByRole("menuitem", { name: /^Later today · \d\d:\d\d/ });
    expect(later).toHaveTextContent(/free/);
    await user.click(later);
    await waitFor(async () => {
      const today = await repositories.blocks.listForDay("2026-10-13");
      const moved = today.find((block) => block.id === "client-call");
      expect(moved && moved.start).not.toBe("2026-10-13T16:30:00+03:30");
    });
    expect(await screen.findByText(/Moved “.*Client call.*” to today at/)).toBeInTheDocument();
  });

  it("does not offer Back to Unscheduled for an event", async () => {
    const user = userEvent.setup();
    setup({ kind: "block", id: "client-call" });
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).queryByRole("menuitem", { name: /Unscheduled/ })).toBeNull();
  });

  it("opens Tomorrow preselected for several blocks and moves them together under one toast", async () => {
    const user = userEvent.setup();
    const { repositories } = setup(
      { kind: "blocks", ids: ["blk-t-od-inbox-zero", "blk-t-od-wrap-up"] },
      { state: "overloaded" },
      { preselect: "tomorrow" },
    );
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("heading", { name: "Move 2 blocks" })).toBeInTheDocument();
    const menu = await within(dialog).findByRole("menu");
    const rows = within(menu).getAllByRole("menuitem");
    expect(rows.map((row) => row.textContent)).not.toContainEqual(expect.stringMatching(/Later today|Unscheduled/));
    expect(within(menu).getByRole("menuitem", { name: /^Tomorrow/ })).toHaveAttribute("data-active");

    await user.click(within(menu).getByRole("menuitem", { name: /^Tomorrow/ }));
    await waitFor(async () => {
      const tomorrow = await repositories.blocks.listForDay("2026-10-14");
      expect(tomorrow.map((block) => block.id)).toEqual(
        expect.arrayContaining(["blk-t-od-inbox-zero", "blk-t-od-wrap-up"]),
      );
    });
    expect(await screen.findByText("Moved 2 blocks to tomorrow at 09:30")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(1);
  });

  it("has a Pick date & time step with a 15-minute start time and a way back", async () => {
    const user = userEvent.setup();
    setup(UI_DESIGN);
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Pick date & time/ }));
    expect(await screen.findByRole("heading", { name: "Pick date & time" })).toHaveFocus();
    expect(screen.getByRole("combobox", { name: "Start time" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move here" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    const pick = await screen.findByRole("menuitem", { name: /^Pick date & time/ });
    await waitFor(() => expect(pick).toHaveFocus());
  });

  it("says when the target no longer exists", async () => {
    const user = userEvent.setup();
    setup({ kind: "block", id: "no-such-block" });
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load the options");
  });

  it("is Persian: title and rows", async () => {
    const user = userEvent.setup();
    setup(UI_DESIGN, { preferences: persian });
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    const menu = await screen.findByRole("menu", { name: "گزینه‌های زمان‌بندی دوباره" });
    expect(within(menu).getByRole("menuitem", { name: /^فردا/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /^بازگشت به بدون زمان/ })).toBeInTheDocument();
  });
});

describe("RescheduleHost below lg", () => {
  beforeEach(() => mockViewport("mobile"));

  it("is a bottom sheet with the same rows", async () => {
    const user = userEvent.setup();
    setup(UI_DESIGN);
    await user.click(screen.getByRole("button", { name: "Open reschedule" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Close" })).not.toBeNull();
    expect(await within(dialog).findByRole("menuitem", { name: /^Tomorrow/ })).toBeInTheDocument();
  });
});
