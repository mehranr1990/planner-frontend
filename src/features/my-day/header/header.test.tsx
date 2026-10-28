import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ContextProbe, persian, readProbe, renderMyDay } from "../states/test-utils";
import { CapacityPill } from "./capacity-pill";
import { DayNav } from "./day-nav";
import { EnergySelector } from "./energy-selector";
import { MyDayHeader } from "./my-day-header";
import { OverloadBar } from "./overload-bar";

describe("CapacityPill", () => {
  it("shows a skeleton while the day loads", () => {
    renderMyDay(<CapacityPill />);
    expect(screen.getByRole("status", { name: "Loading capacity" })).toBeInTheDocument();
  });

  it("reads 6h 15m of 8h planned with a 1h 45m free chip and a filled bar", async () => {
    renderMyDay(<CapacityPill />);
    expect(await screen.findByText("6h 15m of 8h planned")).toBeInTheDocument();
    expect(screen.getByText("1h 45m free").closest("[data-state]")).toHaveAttribute("data-state", "free");
    const bar = screen.getByRole("progressbar", { name: "Capacity used" });
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeCloseTo((375 / 480) * 100, 1);
    expect(bar).toHaveAttribute("aria-valuetext", "6h 15m of 8h planned");
    // The fill grows from the inline start and is not rose.
    expect(bar.firstElementChild?.className).not.toContain("bg-danger");
  });

  it("turns the bar rose and swaps the chip to Overloaded when the day is over capacity", async () => {
    renderMyDay(<CapacityPill />, { state: "overloaded" });
    expect(await screen.findByText("9h 40m of 8h planned")).toBeInTheDocument();
    const chip = screen.getByText("Overloaded").closest<HTMLElement>("[data-state]")!;
    expect(chip).toHaveAttribute("data-state", "over");
    // The chip fades in over 200ms; reduced motion swaps it.
    expect(chip.className).toContain("animate-overlay-in");
    expect(chip.className).toContain("motion-reduce:animate-none");
    expect(screen.queryByText(/free$/)).toBeNull();
    const bar = screen.getByRole("progressbar", { name: "Capacity used" });
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(bar.firstElementChild?.className).toContain("bg-danger");
    // The change is announced.
    expect(chip.closest("[aria-live]")).toHaveAttribute("aria-live", "polite");
  });

  it("is only a chip in the compact (phone) variant", async () => {
    renderMyDay(<CapacityPill compact />);
    expect(await screen.findByText("1h 45m free")).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText("6h 15m of 8h planned")).toBeNull();
  });

  it("names the overload in the compact chip, since the bar is not there", async () => {
    renderMyDay(<CapacityPill compact />, { state: "overloaded" });
    expect(await screen.findByText("Overloaded · 9h 40m of 8h")).toBeInTheDocument();
  });

  it("speaks Persian with Persian digits", async () => {
    renderMyDay(<CapacityPill />, { preferences: persian });
    expect(await screen.findByText("۶ ساعت و ۱۵ دقیقه از ۸ ساعت برنامه‌ریزی شده")).toBeInTheDocument();
    expect(screen.getByText("۱ ساعت و ۴۵ دقیقه آزاد")).toBeInTheDocument();
    expect(screen.getByText("ظرفیت")).toBeInTheDocument();
  });

  it("keeps Latin digits in Persian when the digit setting says so", async () => {
    renderMyDay(<CapacityPill />, { preferences: { ...persian, digits: "latn" } });
    expect(await screen.findByText("6 ساعت و 15 دقیقه از 8 ساعت برنامه‌ریزی شده")).toBeInTheDocument();
  });
});

describe("EnergySelector", () => {
  it("is a named group of Low / Medium / High bound to the context, Medium by default", async () => {
    const user = userEvent.setup();
    renderMyDay(
      <>
        <EnergySelector />
        <ContextProbe />
      </>,
    );
    const group = screen.getByRole("radiogroup", { name: "Energy today" });
    expect(screen.getByText("Energy")).toBeInTheDocument();
    const [low, medium, high] = ["Low", "Medium", "High"].map((name) => within(group).getByRole("radio", { name }));
    expect(medium).toBeChecked();
    expect(low).not.toBeChecked();

    await user.click(high!);
    expect(high).toBeChecked();
    expect(readProbe().energy).toBe("high");

    // Pressing the active item again keeps the selection.
    await user.click(high!);
    expect(high).toBeChecked();
  });

  it("starts from the context's initial energy and is keyboard operable", async () => {
    const user = userEvent.setup();
    renderMyDay(
      <>
        <EnergySelector />
        <ContextProbe />
      </>,
      { initialEnergy: "low" },
    );
    const low = screen.getByRole("radio", { name: "Low" });
    expect(low).toBeChecked();
    low.focus();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(readProbe().energy).toBe("medium");
  });

  it("speaks Persian", () => {
    renderMyDay(<EnergySelector />, { preferences: persian });
    const group = screen.getByRole("radiogroup", { name: "سطح انرژی امروز" });
    expect(within(group).getByRole("radio", { name: "زیاد" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "متوسط" })).toBeChecked();
  });
});

describe("DayNav", () => {
  it("moves a day at a time and offers Today only away from today", async () => {
    const user = userEvent.setup();
    renderMyDay(
      <>
        <DayNav />
        <ContextProbe />
      </>,
    );
    expect(readProbe().day).toBe("2026-10-13");
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(readProbe().day).toBe("2026-10-14");
    await user.click(screen.getByRole("button", { name: "Next day" }));
    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(readProbe().day).toBe("2026-10-14");

    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(readProbe().day).toBe("2026-10-13");
    expect(screen.queryByRole("button", { name: "Today" })).toBeNull();
  });

  it("is two 56px circles whose chevrons mirror under RTL", () => {
    renderMyDay(<DayNav />, { preferences: persian });
    const group = screen.getByRole("group", { name: "تغییر روز" });
    const previous = within(group).getByRole("button", { name: "روز قبل" });
    const next = within(group).getByRole("button", { name: "روز بعد" });
    for (const button of [previous, next]) {
      expect(button.className).toContain("size-14");
      expect(button.querySelector("svg")?.getAttribute("class")).toContain("rtl:-scale-x-100");
    }
  });
});

describe("MyDayHeader", () => {
  it("shows the date kicker, the title and the desktop controls", async () => {
    renderMyDay(<MyDayHeader variant="desktop" />);
    expect(screen.getByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
    expect(screen.getByText("Tuesday, 21 Mehr · 13 Oct")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Energy today" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Change day" })).toBeInTheDocument();
    expect(await screen.findByText("6h 15m of 8h planned")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("lg:type-display");
  });

  it("follows the day: the kicker and Today affordance change when the arrows are used", async () => {
    const user = userEvent.setup();
    renderMyDay(<MyDayHeader variant="desktop" />);
    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(screen.getByText("Wednesday, 22 Mehr · 14 Oct")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument();
  });

  it("is the simpler phone header when compact: short kicker, title and one chip", async () => {
    renderMyDay(<MyDayHeader variant="compact" />);
    expect(screen.getByRole("heading", { level: 1, name: "My Day" })).toBeInTheDocument();
    expect(screen.getByText("Tue 21 Mehr")).toBeInTheDocument();
    expect(await screen.findByText("1h 45m free")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: "Energy today" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next day" })).toBeNull();
  });

  it("renders both layouts by default and lets CSS pick one", () => {
    renderMyDay(<MyDayHeader />);
    expect(screen.getByRole("radiogroup", { name: "Energy today" }).closest("div.max-lg\\:hidden")).not.toBeNull();
    expect(screen.getByText("Tue 21 Mehr").className).toContain("lg:hidden");
  });

  it("is Persian: title, Jalali kicker with both calendars, Persian digits", async () => {
    renderMyDay(<MyDayHeader variant="desktop" />, { preferences: persian });
    expect(screen.getByRole("heading", { level: 1, name: "روز من" })).toBeInTheDocument();
    expect(screen.getByText(/^سه‌شنبه ۲۱ مهر · ۱۳/)).toBeInTheDocument();
    expect(await screen.findByText("۱ ساعت و ۴۵ دقیقه آزاد")).toBeInTheDocument();
  });
});

describe("OverloadBar", () => {
  it("renders nothing unless the day is over capacity", async () => {
    const { container } = renderMyDay(<OverloadBar />);
    // Let the day load, then check nothing appeared.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.querySelector("[role=status]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Move/ })).toBeNull();
  });

  it("shows the rose chip, the overlap chip and Move 2 to tomorrow for an overloaded day", async () => {
    renderMyDay(<OverloadBar />, { state: "overloaded" });
    expect(await screen.findByText("Overloaded · 9h 40m of 8h")).toBeInTheDocument();
    expect(screen.getByText("1 overlap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move 2 to tomorrow" })).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("drops the rose chip when the header already shows it (phone)", async () => {
    renderMyDay(<OverloadBar showSummary={false} />, { state: "overloaded" });
    expect(await screen.findByText("1 overlap")).toBeInTheDocument();
    expect(screen.queryByText("Overloaded · 9h 40m of 8h")).toBeNull();
    expect(screen.getByRole("button", { name: "Move 2 to tomorrow" })).toBeInTheDocument();
  });

  it("opens Reschedule preselected on Tomorrow for the lowest-priority task blocks", async () => {
    const user = userEvent.setup();
    renderMyDay(
      <>
        <OverloadBar />
        <ContextProbe />
      </>,
      { state: "overloaded" },
    );
    const button = await screen.findByRole("button", { name: "Move 2 to tomorrow" });
    await user.click(button);
    expect(readProbe().target).toEqual({
      kind: "blocks",
      ids: ["blk-t-od-inbox-zero", "blk-t-od-wrap-up"],
    });
    expect(readProbe().preselect).toBe("tomorrow");
  });

  it("is Persian", async () => {
    renderMyDay(<OverloadBar />, { state: "overloaded", preferences: persian });
    expect(await screen.findByText("پرکار · ۹ ساعت و ۴۰ دقیقه از ۸ ساعت")).toBeInTheDocument();
    expect(screen.getByText("۱ همپوشانی")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "انتقال ۲ مورد به فردا" })).toBeInTheDocument();
  });
});
