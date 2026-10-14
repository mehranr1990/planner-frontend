import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { Field, FieldLabel } from "./field";
import { Select, SelectItem } from "./select";

beforeAll(() => {
  // jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

function Priorities(props: Partial<Parameters<typeof Select>[0]>) {
  return (
    <Select aria-label="Priority" {...props}>
      <SelectItem value="urgent" dotClassName="bg-danger">
        Urgent
      </SelectItem>
      <SelectItem value="high" dotClassName="bg-warning">
        High
      </SelectItem>
      <SelectItem value="normal" disabled>
        Normal
      </SelectItem>
    </Select>
  );
}

describe("Select", () => {
  it("shows the placeholder until a value is chosen", () => {
    renderWithProviders(<Priorities />);
    expect(screen.getByRole("combobox", { name: "Priority" })).toHaveTextContent("Select…");
  });

  it("opens from the keyboard and selects an option", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    renderWithProviders(<Priorities onValueChange={onValueChange} />);
    const trigger = screen.getByRole("combobox");
    trigger.focus();
    await user.keyboard("{Enter}");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const option = await screen.findByRole("option", { name: "High" });
    act(() => option.focus());
    await user.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("high");
    await waitFor(() => expect(trigger).toHaveTextContent("High"));
  });

  it("marks the selected option and disabled options", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Priorities defaultValue="urgent" />);
    screen.getByRole("combobox").focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("option", { name: "Urgent" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "Normal" })).toHaveAttribute("aria-disabled", "true");
  });

  it("works controlled (Controller-style value/onValueChange)", async () => {
    const user = userEvent.setup();
    function Controlled() {
      const [value, setValue] = useState("urgent");
      return (
        <>
          <Priorities value={value} onValueChange={setValue} />
          <output>{value}</output>
        </>
      );
    }
    renderWithProviders(<Controlled />);
    screen.getByRole("combobox").focus();
    await user.keyboard("{Enter}");
    const option = await screen.findByRole("option", { name: "High" });
    act(() => option.focus());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("high");
  });

  it("supports invalid and disabled", () => {
    const { rerender } = renderWithProviders(<Priorities invalid />);
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
    rerender(<Priorities disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("is labelled by a FieldLabel", () => {
    renderWithProviders(
      <Field required>
        <FieldLabel>Priority</FieldLabel>
        <Select>
          <SelectItem value="low">Low</SelectItem>
        </Select>
      </Field>,
    );
    const trigger = screen.getByRole("combobox", { name: /Priority/ });
    expect(trigger).toHaveAttribute("aria-required", "true");
  });

  it("follows RTL and Persian placeholder text", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Select aria-label="اولویت">
        <SelectItem value="high">بالا</SelectItem>
      </Select>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    const trigger = screen.getByRole("combobox", { name: "اولویت" });
    expect(trigger).toHaveTextContent("انتخاب کنید…");
    trigger.focus();
    await user.keyboard("{Enter}");
    const listbox = await screen.findByRole("listbox");
    expect(listbox.closest("[dir]")).toHaveAttribute("dir", "rtl");
  });
});
