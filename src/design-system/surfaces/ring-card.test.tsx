import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Briefcase, Code } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { RingCard, type RingCardProps } from "./ring-card";

const periods = [
  { id: "jul", value: 104, label: "Jul" },
  { id: "aug", value: 122, label: "Aug" },
  { id: "sep", value: 140, label: "Sep" },
  { id: "oct", value: 160, label: "Oct" },
];

function MonthlyFocus(props: Partial<RingCardProps>) {
  const [index, setIndex] = useState(3);
  const period = periods[index]!;
  return (
    <RingCard
      title="Monthly focus"
      subtitle={`Goal 200 h · ${period.label}`}
      value={Number(period.value)}
      max={200}
      unit="Hours"
      ringLabel="Monthly focus"
      onPrevious={() => setIndex((i) => Math.max(0, i - 1))}
      onNext={() => setIndex((i) => Math.min(periods.length - 1, i + 1))}
      previousDisabled={index === 0}
      nextDisabled={index === periods.length - 1}
      stats={[
        { id: "total", icon: Code, value: 45, label: "total hours" },
        { id: "earned", icon: Briefcase, value: "1.7M", label: "earned · Toman" },
      ]}
      periods={periods}
      selectedPeriod={period.id}
      onPeriodChange={(id) => setIndex(periods.findIndex((p) => p.id === id))}
      periodsLabel="Period"
      details={<p>Deep work 92h</p>}
      historyLabel="History"
      detailsLabel="Details"
      tabsLabel="Monthly focus view"
      {...props}
    />
  );
}

describe("RingCard", () => {
  it("renders title, ring, stats and the history selector", () => {
    renderWithProviders(<MonthlyFocus />);
    expect(screen.getByRole("region", { name: "Monthly focus" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Monthly focus" })).toBeInTheDocument();
    const ring = screen.getByRole("progressbar", { name: "Monthly focus" });
    expect(ring).toHaveAttribute("aria-valuenow", "160");
    expect(ring).toHaveTextContent("160");
    expect(screen.getByText("total hours")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /160/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("tab", { name: "History" })).toHaveAttribute("aria-selected", "true");
  });

  it("steps periods with the arrows and the selector", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonthlyFocus />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "140");
    expect(screen.getByRole("radio", { name: /140/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /104/ }));
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "104");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("switches to the details tab and merges it into the card", async () => {
    const user = userEvent.setup();
    const onViewChange = vi.fn();
    renderWithProviders(<MonthlyFocus onViewChange={onViewChange} />);
    const history = screen.getByRole("tab", { name: "History" });
    expect(history.className).toContain("after:start-full");
    await user.click(screen.getByRole("tab", { name: "Details" }));
    expect(onViewChange).toHaveBeenCalledWith("details");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Deep work 92h");
    expect(screen.getByRole("tab", { name: "Details" }).className).toContain("after:end-full");
    expect(screen.queryByRole("radiogroup", { name: "Period" })).not.toBeInTheDocument();
  });

  it("uses Persian digits, mirrored chevrons and RTL keyboard order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonthlyFocus previousLabel="قبلی" nextLabel="بعدی" />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("progressbar")).toHaveTextContent("۱۶۰");
    expect(screen.getByRole("radio", { name: /۱۰۴/ })).toBeInTheDocument();
    expect(screen.getByText("۴۵")).toBeInTheDocument();
    expect(screen.getByText("۱.۷M")).toBeInTheDocument();
    const chevron = screen.getByRole("button", { name: "قبلی" }).querySelector("svg")!;
    expect(chevron.getAttribute("class")).toContain("rtl:-scale-x-100");
    await user.click(screen.getByRole("radio", { name: /۱۲۲/ }));
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: /۱۴۰/ })).toHaveFocus();
  });

  it("falls back to Common labels for the arrows", () => {
    renderWithProviders(<MonthlyFocus previousLabel={undefined} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    expect(screen.getByRole("button", { name: "قبلی" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "بعدی" })).toBeInTheDocument();
  });

  it("puts the tab row before the panels in DOM and keyboard order", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MonthlyFocus />);
    const tablist = screen.getByRole("tablist", { name: "Monthly focus view" });
    const panel = screen.getByRole("tabpanel");
    expect(tablist.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // ...and after the header controls.
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    previous.focus();
    await user.tab();
    expect(screen.getByRole("tab", { name: "History" })).toHaveFocus();
    await user.tab();
    // Next stop is the panel the tab controls (or its first control).
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("shrinks the ring below sm so the card fits a 320px column", () => {
    renderWithProviders(<MonthlyFocus />);
    const ring = screen.getByRole("progressbar");
    // jsdom has no layout: assert the responsive contract. Below sm the row is
    // 48 + 8 + 144 + 8 + 48 = 256px inside 320 − 2 × 16px padding.
    expect(ring).toHaveClass("max-sm:size-36");
    expect(ring.parentElement).toHaveClass("gap-2", "sm:gap-3.5");
    expect(ring.querySelector("svg")).toHaveAttribute("viewBox", "0 0 196 196");
    expect(ring.querySelector("svg")).not.toHaveAttribute("width");
  });
});
