import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { FormErrorSummary, fieldErrorsToSummary, focusErrorSummary } from "./form-error-summary";
import { RadioGroup, RadioGroupItem } from "./radio-group";

const errors = [
  { fieldId: "title", message: "Title is required" },
  { fieldId: "amount", message: "Numbers only" },
];

describe("FormErrorSummary", () => {
  it("renders nothing without errors", () => {
    renderWithProviders(<FormErrorSummary errors={[]} />);
    expect(screen.queryByRole("region", { name: "Please fix the following" })).not.toBeInTheDocument();
  });

  it("is a focusable labelled region (not a live alert) with a heading and links to each field", () => {
    renderWithProviders(<FormErrorSummary errors={errors} />);
    const region = screen.getByRole("region", { name: "Please fix the following" });
    expect(region).toHaveAttribute("tabindex", "-1");
    // Focus announces it; role="alert" would announce it twice.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(region).not.toHaveAttribute("aria-live");
    expect(screen.getByRole("heading", { name: "Please fix the following" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Numbers only" })).toHaveAttribute("href", "#amount");
  });

  it("focuses the field when a link is activated", async () => {
    renderWithProviders(
      <>
        <FormErrorSummary errors={errors} />
        <input id="title" aria-label="Title" />
      </>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Title is required" }));
    expect(screen.getByRole("textbox", { name: "Title" })).toHaveFocus();
  });

  it("focuses the checked radio when the target is a radio group", async () => {
    renderWithProviders(
      <>
        <FormErrorSummary errors={[{ fieldId: "repeat", message: "Pick a repeat" }]} />
        <RadioGroup id="repeat" aria-label="Repeat" defaultValue="weekly">
          <RadioGroupItem value="daily" label="Daily" />
          <RadioGroupItem value="weekly" label="Weekly" />
        </RadioGroup>
      </>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Pick a repeat" }));
    expect(screen.getByRole("radio", { name: "Weekly" })).toHaveFocus();
  });

  it("focuses the first enabled control when nothing in the group is checked", async () => {
    renderWithProviders(
      <>
        <FormErrorSummary errors={[{ fieldId: "repeat", message: "Pick a repeat" }]} />
        <RadioGroup id="repeat" aria-label="Repeat">
          <RadioGroupItem value="never" label="Never" disabled />
          <RadioGroupItem value="daily" label="Daily" />
          <RadioGroupItem value="weekly" label="Weekly" />
        </RadioGroup>
      </>,
    );
    await userEvent.click(screen.getByRole("link", { name: "Pick a repeat" }));
    expect(screen.getByRole("radio", { name: "Daily" })).toHaveFocus();
  });

  it("moves focus to itself when focusKey changes", () => {
    const { rerender } = renderWithProviders(<FormErrorSummary errors={errors} />);
    expect(screen.getByRole("region", { name: "Please fix the following" })).not.toHaveFocus();
    rerender(<FormErrorSummary errors={errors} focusKey={1} />);
    expect(screen.getByRole("region", { name: "Please fix the following" })).toHaveFocus();
  });

  it("exposes a focus helper and a Persian title", () => {
    renderWithProviders(<FormErrorSummary errors={errors} />, {
      preferences: { locale: "fa", direction: "rtl", digits: "fa" },
    });
    const region = screen.getByRole("region", { name: "لطفاً این موارد را اصلاح کنید" });
    focusErrorSummary(region);
    expect(region).toHaveFocus();
  });

  it("converts react-hook-form errors", () => {
    expect(
      fieldErrorsToSummary(
        {
          title: { type: "too_small", message: "Title is required" },
          note: { type: "custom" },
        },
        (name) => `task-${name}`,
      ),
    ).toEqual([{ fieldId: "task-title", message: "Title is required" }]);
  });
});
