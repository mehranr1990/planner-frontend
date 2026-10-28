import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Share2 } from "lucide-react";
import { SignatureCardAction } from "@/design-system/surfaces/signature-card";
import { WeeklyStory } from "./weekly-story";

describe("WeeklyStory", () => {
  it("renders the headline, metrics and the notch action; metrics jump to their step", () => {
    const onSelect = vi.fn();
    render(
      <WeeklyStory
        tone="hard"
        headingId="story"
        animate={false}
        kicker="Your week at a glance"
        headline="A heavy week. Next week can be lighter."
        line="Rest counts as progress too."
        action={<SignatureCardAction label="Share summary" icon={Share2} />}
        metrics={[
          { id: "tasks", value: 15, format: (v) => String(v), label: "Tasks done", onSelect, selectLabel: "Tasks done: open Carry over" },
          { id: "mood", value: 2, format: () => "Low", label: "Average mood" },
        ]}
      />,
    );
    expect(screen.getByRole("region", { name: "A heavy week. Next week can be lighter." })).toHaveAttribute("data-tone", "hard");
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText(/Rest counts/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share summary" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tasks done: open Carry over" }));
    expect(onSelect).toHaveBeenCalled();
  });

  it("counts numbers up on entrance but keeps the final value for screen readers", () => {
    render(
      <WeeklyStory
        tone="good"
        kicker="k"
        headline="A focused and balanced week."
        action={<SignatureCardAction label="Share summary" icon={Share2} />}
        metrics={[{ id: "tasks", value: 31, format: (v) => String(Math.round(v)), label: "Tasks done" }]}
      />,
    );
    expect(screen.getByText("31", { selector: ".sr-only" })).toBeInTheDocument();
  });
});
