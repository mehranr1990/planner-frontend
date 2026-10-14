import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";
import { Skeleton } from "./skeleton";

describe("Skeleton", () => {
  it("is decorative, shimmers and stops for reduced motion", () => {
    const { container } = render(<Skeleton className="w-24" />);
    const block = container.firstElementChild;
    expect(block).toHaveAttribute("aria-hidden", "true");
    expect(block).toHaveClass("animate-shimmer", "motion-reduce:animate-none", "bg-raised", "rounded-pill", "w-24");
  });

  it("supports shape variants", () => {
    const { container } = render(
      <>
        <Skeleton shape="circle" />
        <Skeleton shape="card" />
        <Skeleton shape="row" />
      </>,
    );
    const [circle, card, row] = Array.from(container.children);
    expect(circle).toHaveClass("aspect-square", "rounded-pill");
    expect(card).toHaveClass("rounded-card");
    expect(row).toHaveClass("rounded-row", "h-12");
  });
});

describe("Separator", () => {
  it("is decorative by default", () => {
    const { container } = render(<Separator />);
    expect(container.firstElementChild).toHaveAttribute("role", "none");
    expect(container.firstElementChild).toHaveClass("h-px", "bg-line");
  });

  it("exposes a semantic vertical separator", () => {
    render(<Separator orientation="vertical" decorative={false} />);
    const separator = screen.getByRole("separator");
    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveClass("w-px");
  });
});

describe("ScrollArea", () => {
  it("renders its content inside a viewport and follows dir", () => {
    render(
      <ScrollArea dir="rtl" className="max-h-40">
        <p>Long content</p>
      </ScrollArea>,
    );
    const content = screen.getByText("Long content");
    const root = content.closest("[dir]");
    expect(root).toHaveAttribute("dir", "rtl");
    expect(content.closest("[data-radix-scroll-area-viewport]")).toHaveClass("max-h-[inherit]");
  });
});
