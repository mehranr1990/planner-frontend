import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Field, FieldLabel } from "./field";
import { RadioGroup, RadioGroupItem } from "./radio-group";

function Repeat(props: Parameters<typeof RadioGroup>[0]) {
  return (
    <RadioGroup aria-label="Repeat" {...props}>
      <RadioGroupItem value="never" label="Never" description="One-off" />
      <RadioGroupItem value="daily" label="Every day" description="Including weekend" />
      <RadioGroupItem value="weekdays" label="Work week" description="Sat – Wed" />
      <RadioGroupItem value="custom" label="Custom…" disabled />
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("renders labelled options with descriptions", () => {
    renderWithProviders(<Repeat defaultValue="weekdays" />);
    expect(screen.getByRole("radiogroup", { name: "Repeat" })).toBeInTheDocument();
    const work = screen.getByRole("radio", { name: "Work week" });
    expect(work).toHaveAttribute("aria-checked", "true");
    expect(work).toHaveAccessibleDescription("Sat – Wed");
  });

  it("selects by click and moves with arrow keys", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(<Repeat defaultValue="never" onValueChange={onValueChange} />);
    await user.click(screen.getByText("Every day"));
    expect(onValueChange).toHaveBeenLastCalledWith("daily");
    await user.click(screen.getByRole("radio", { name: "Every day" }));
    // Hold the key: Radix checks the item that receives focus while an arrow is down.
    await user.keyboard("{ArrowDown>}");
    await waitFor(() => expect(screen.getByRole("radio", { name: "Work week" })).toHaveFocus());
    await user.keyboard("{/ArrowDown}");
    await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith("weekdays"));
  });

  it("skips disabled options", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Repeat defaultValue="weekdays" />);
    expect(screen.getByRole("radio", { name: "Custom…" })).toBeDisabled();
    screen.getByRole("radio", { name: "Work week" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("radio", { name: "Never" })).toHaveFocus();
  });

  it("is named by a FieldLabel", () => {
    renderWithProviders(
      <Field required>
        <FieldLabel>Repeat</FieldLabel>
        <RadioGroup>
          <RadioGroupItem value="never" label="Never" />
        </RadioGroup>
      </Field>,
    );
    const group = screen.getByRole("radiogroup", { name: /Repeat/ });
    expect(group).toHaveAttribute("aria-required", "true");
  });

  it("uses RTL arrow semantics from the app direction", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <RadioGroup aria-label="تکرار" orientation="horizontal" defaultValue="a">
        <RadioGroupItem value="a" label="هرگز" />
        <RadioGroupItem value="b" label="هر روز" />
      </RadioGroup>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    screen.getByRole("radio", { name: "هرگز" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("radio", { name: "هر روز" })).toHaveFocus();
  });
});
