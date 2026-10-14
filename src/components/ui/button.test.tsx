import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChevronRight, Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Button, IconButton, buttonVariants } from "./button";

describe("Button", () => {
  it("renders a real button that defaults to type=button", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("bg-primary");
    expect(button.className).toContain("min-h-touch");
  });

  it.each([
    ["primary", "bg-primary"],
    ["secondary", "bg-secondary"],
    ["outline", "border-outline"],
    ["destructive", "bg-destructive"],
    ["ghost", "bg-transparent"],
  ] as const)("applies the %s variant", (variant, token) => {
    render(<Button variant={variant}>Save</Button>);
    expect(screen.getByRole("button").className).toContain(token);
  });

  it("has a compact 40px size", () => {
    expect(buttonVariants({ size: "sm" })).toContain("min-h-10");
  });

  it("does not fire clicks when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("is busy, focusable and inert while loading, keeping its name", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).not.toHaveBeenCalled();
  });

  it("swaps in loadingText while keeping the label laid out for a stable width", () => {
    render(
      <Button loading loadingText="Saving">
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    const hiddenLabel = screen.getByText("Save");
    expect(hiddenLabel).toHaveClass("invisible");
    expect(hiddenLabel).toHaveAttribute("aria-hidden", "true");
    expect(button).toHaveAttribute("data-loading", "true");
  });

  it("never submits a form while loading", async () => {
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Button type="submit" loading>
          Save
        </Button>
      </form>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
    await userEvent.click(screen.getByRole("button"));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("styles a child element with asChild", () => {
    render(
      <Button asChild variant="outline">
        <a href="/tasks">Tasks</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Tasks" });
    expect(link.className).toContain("rounded-pill");
    expect(link.className).toContain("border-outline");
  });
});

describe("IconButton", () => {
  it("takes its accessible name from label", () => {
    render(<IconButton icon={Plus} label="Add task" />);
    const button = screen.getByRole("button", { name: "Add task" });
    expect(button.className).toContain("size-touch");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("accepts aria-label and custom children", () => {
    render(
      <IconButton aria-label="Profile" size="lg" variant="ghost">
        <span>MR</span>
      </IconButton>,
    );
    expect(screen.getByRole("button", { name: "Profile" }).className).toContain("size-13");
  });

  it.each([
    ["sm", "size-10"],
    ["md", "size-touch"],
    ["lg", "size-13"],
  ] as const)("supports the %s size", (size, token) => {
    render(<IconButton icon={Plus} label="Add" size={size} />);
    expect(screen.getByRole("button").className).toContain(token);
  });

  it("warns in development when it has no name", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<IconButton icon={Plus} />);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("accessible name"));
    error.mockRestore();
  });

  it("mirrors directional glyphs under RTL only when asked", () => {
    renderWithProviders(
      <div dir="rtl">
        <IconButton icon={ChevronRight} mirror label="بعدی" />
        <IconButton icon={Plus} label="افزودن" />
      </div>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    expect(screen.getByRole("button", { name: "بعدی" }).querySelector("svg")).toHaveClass("rtl:-scale-x-100");
    expect(screen.getByRole("button", { name: "افزودن" }).querySelector("svg")).not.toHaveClass("rtl:-scale-x-100");
  });

  it("supports loading", () => {
    render(<IconButton icon={Plus} label="Add" loading />);
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("aria-busy", "true");
  });
});
