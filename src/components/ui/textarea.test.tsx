import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Field, FieldError, FieldLabel } from "./field";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  it("is a resizable multi-line field with RHF props", async () => {
    const ref = createRef<HTMLTextAreaElement>();
    const onChange = vi.fn();
    render(<Textarea aria-label="Notes" name="notes" ref={ref} onChange={onChange} placeholder="Add details…" />);
    const textarea = screen.getByRole("textbox", { name: "Notes" });
    expect(ref.current).toBe(textarea);
    expect(textarea).toHaveAttribute("rows", "3");
    expect(textarea.className).toContain("resize-y");
    await userEvent.type(textarea, "a");
    expect(onChange).toHaveBeenCalled();
  });

  it("supports invalid, disabled and read-only states", () => {
    const { rerender } = render(<Textarea aria-label="Notes" invalid />);
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-invalid", "true");
    rerender(<Textarea aria-label="Notes" disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
    rerender(<Textarea aria-label="Notes" readOnly />);
    expect(screen.getByRole("textbox")).toHaveAttribute("readonly");
  });

  it("is wired by a Field", async () => {
    renderWithProviders(
      <Field>
        <FieldLabel>Notes</FieldLabel>
        <Textarea />
        <FieldError>Too long</FieldError>
      </Field>,
    );
    const textarea = screen.getByLabelText("Notes");
    expect(await screen.findByText("Too long")).toBeInTheDocument();
    expect(textarea).toHaveAttribute("aria-invalid", "true");
    expect(textarea).toHaveAccessibleDescription("Too long");
  });
});
