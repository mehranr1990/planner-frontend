import { screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sampleNow, sampleScheduleBlocks, sampleScheduleDate } from "@/fixtures/shell";
import { renderWithProviders } from "@/test/render";
import type { ScheduleBlock } from "./schedule";
import { ScheduleIsland } from "./schedule-island";

function renderIsland(preferences?: Parameters<typeof renderWithProviders>[1]) {
  return renderWithProviders(
    <ScheduleIsland date={sampleScheduleDate} now={sampleNow} blocks={sampleScheduleBlocks} />,
    preferences,
  );
}

describe("ScheduleIsland", () => {
  it("lists done, current and upcoming blocks", () => {
    const { container } = renderIsland();
    const island = screen.getByRole("region", { name: "Today's schedule" });
    expect(island).toHaveTextContent("Today");
    expect(island).toHaveTextContent("13 Oct");
    const items = within(island).getAllByRole("listitem");
    expect(items.map((item) => item.dataset.status)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(items[0]).toHaveTextContent("Lunch · done");
    expect(items[2]).toHaveTextContent("16:30 · Client call");
    expect(container.querySelector('[data-status="upcoming"]')!.className).toContain("bg-project-soft");
  });

  it("announces the current block as now, with its elapsed fill and compact time range", () => {
    const { container } = renderIsland();
    const current = container.querySelector<HTMLElement>('[data-status="current"]')!;
    expect(current).toHaveAttribute("aria-current", "time");
    expect(current).toHaveTextContent("UI design · My Day");
    expect(current).toHaveTextContent("Now 14:35");
    expect(current.querySelector('[data-slot="range"]')).toHaveTextContent("14:00 – 16:00");
    expect(within(current).getByRole("img", { name: "Peter Thomas" })).toBeInTheDocument();
    const fill = current.querySelector<HTMLElement>('[data-slot="elapsed"]')!;
    expect(fill.style.width).toBe("29.2%");
    expect(fill.className).toContain("start-0");
    expect(fill.className).toContain("bg-scope-soft");
    const marker = current.querySelector<HTMLElement>('[data-slot="now-marker"]')!;
    expect(marker.style.insetInlineStart).toBe("29.2%");
    expect(marker.querySelector(".bg-volt")).not.toBeNull();
  });

  it("puts the title before the range so the range is what drops when narrow", () => {
    const { container } = renderIsland();
    const text = container.querySelector<HTMLElement>('[data-slot="current-text"]')!;
    // One clipped wrapping line: the range wraps away before the title shrinks.
    expect(text.className).toContain("flex-wrap");
    expect(text.className).toContain("overflow-hidden");
    expect(text.firstElementChild).toHaveTextContent("UI design · My Day");
    expect(text.lastElementChild).toHaveAttribute("data-slot", "range");
  });

  it("drops later blocks first on narrow tracks", () => {
    const { container } = renderIsland();
    const [done, current, first, second] = Array.from(container.querySelectorAll<HTMLElement>("li"));
    expect(current!.className).not.toContain("hidden");
    expect(done!.className).toContain("@lg:flex");
    expect(first!.className).toContain("@2xs:flex");
    expect(second!.className).toContain("@xl:flex");
  });

  it("formats the Jalali date and times with Persian digits in fa", () => {
    renderWithProviders(<ScheduleIsland date={sampleScheduleDate} now={sampleNow} blocks={sampleScheduleBlocks} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa", calendar: "jalali" },
    });
    const island = screen.getByRole("region", { name: "برنامه‌ی امروز" });
    expect(island).toHaveTextContent("امروز");
    expect(island).toHaveTextContent("۲۱ مهر");
    expect(island).toHaveTextContent("الان ۱۴:۳۵");
    expect(island).toHaveTextContent("۱۴:۰۰ تا ۱۶:۰۰");
    expect(island).toHaveTextContent("۱۶:۳۰ · Client call");
    expect(island).toHaveTextContent("Lunch · انجام‌شده");
  });

  it("marks sample content only when asked", () => {
    const { unmount } = renderIsland();
    expect(screen.queryByText("Sample data")).not.toBeInTheDocument();
    unmount();
    renderWithProviders(
      <ScheduleIsland date={sampleScheduleDate} now={sampleNow} blocks={sampleScheduleBlocks} sample />,
    );
    expect(within(screen.getByRole("region", { name: "Today's schedule" })).getByText("Sample data")).toBeVisible();
  });
});

describe("ScheduleIsland time zone", () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  // Instants from UTC fields: 10:30Z = 14:00 Tehran (+03:30, no DST).
  const utc = (hours: number, minutes = 0) => new Date(Date.UTC(2026, 9, 13, hours, minutes));
  const blocks: ScheduleBlock[] = [
    { id: "a", title: "Standup", start: utc(9, 30), end: utc(10), scope: "team" },
    { id: "b", title: "Focus", start: utc(10, 30), end: utc(12, 30), scope: "project" },
    { id: "c", title: "Review", start: utc(13), end: utc(13, 30), scope: "project" },
  ];

  it.each([
    ["UTC", 0],
    ["America/Los_Angeles", 420],
    ["Asia/Tehran", -210],
  ] as const)(
    "shows the Tehran wall clock when the process runs in %s",
    (zone, offset) => {
      process.env.TZ = zone;
      // Node applies a runtime TZ change; prove the process zone really moved.
      expect(utc(12).getTimezoneOffset()).toBe(offset);
      const { container } = renderWithProviders(
        // 21:05Z on the 12th is 00:35 on the 13th in Tehran.
        <ScheduleIsland date={utc(-3, 5)} now={utc(11, 5)} blocks={blocks} />,
      );
      const island = screen.getByRole("region", { name: "Today's schedule" });
      expect(island).toHaveTextContent("13 Oct");
      expect(island.querySelector("time")).toHaveAttribute("dateTime", "2026-10-13");
      const current = container.querySelector<HTMLElement>('[data-status="current"]')!;
      expect(current).toHaveTextContent("Focus");
      expect(current).toHaveTextContent("14:00 – 16:00");
      expect(current).toHaveTextContent("Now 14:35");
      const next = container.querySelector<HTMLElement>('[data-status="upcoming"]')!;
      expect(next).toHaveTextContent("16:30 · Review");
      // The machine-readable value stays the real instant.
      expect(next.querySelector("time")).toHaveAttribute("dateTime", "2026-10-13T13:00:00.000Z");
    },
  );
});
