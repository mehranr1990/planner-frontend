import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./input";

describe("Input", () => {
  it("passes RHF-style props through: name, ref, onChange, onBlur, inputMode", async () => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const onBlur = vi.fn();
    render(
      <Input aria-label="Amount" name="amount" ref={ref} onChange={onChange} onBlur={onBlur} inputMode="decimal" />,
    );
    const input = screen.getByRole("textbox", { name: "Amount" });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute("name", "amount");
    expect(input).toHaveAttribute("inputmode", "decimal");
    await userEvent.type(input, "12");
    expect(onChange).toHaveBeenCalledTimes(2);
    await userEvent.tab();
    expect(onBlur).toHaveBeenCalled();
  });

  it("works uncontrolled and controlled", async () => {
    const { rerender } = render(<Input aria-label="Title" defaultValue="Draft" />);
    expect(screen.getByRole("textbox")).toHaveValue("Draft");
    rerender(<Input aria-label="Title" value="Fixed" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("Fixed");
  });

  it("shows the invalid state on the box and the input", () => {
    render(<Input aria-label="Amount" invalid />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.parentElement).toHaveAttribute("data-invalid", "true");
  });

  it("supports disabled and read-only", async () => {
    const { rerender } = render(<Input aria-label="Workspace" disabled defaultValue="Euroly" />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("textbox").parentElement).toHaveAttribute("data-disabled", "true");
    rerender(<Input aria-label="Workspace" readOnly defaultValue="Euroly" />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "x");
    expect(input).toHaveValue("Euroly");
    expect(input.parentElement).toHaveAttribute("data-readonly", "true");
  });

  it("shows a spinner at the inline end while loading", () => {
    render(<Input aria-label="Handle" loading />);
    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("aria-busy", "true");
    expect(input.parentElement!.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders start and end adornments inside the box", () => {
    render(
      <Input
        aria-label="Amount"
        startAdornment={<span data-testid="start">#</span>}
        endAdornment={<button type="button">Toman</button>}
      />,
    );
    const box = screen.getByRole("textbox").parentElement!;
    expect(box).toContainElement(screen.getByTestId("start"));
    expect(box).toContainElement(screen.getByRole("button", { name: "Toman" }));
    // Logical padding only, so it mirrors in RTL.
    expect(box.innerHTML).not.toMatch(/\b(pl|pr|ml|mr)-/);
  });

  it("maps a native required to aria-required", () => {
    render(<Input aria-label="Title" required />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-required", "true");
  });
});
