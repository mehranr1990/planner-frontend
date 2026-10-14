import { zodResolver } from "@hookform/resolvers/zod";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Controller, useForm } from "react-hook-form";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { renderWithProviders } from "@/test/render";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "./field";
import { FormErrorSummary, fieldErrorsToSummary } from "./form-error-summary";
import { Input } from "./input";
import { Select, SelectItem } from "./select";

beforeAll(() => {
  // jsdom lacks the pointer-capture and scrolling APIs Radix Select calls.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

describe("Field", () => {
  it("labels the control and links description and error", async () => {
    const { rerender } = renderWithProviders(
      <Field>
        <FieldLabel>Amount</FieldLabel>
        <Input />
        <FieldDescription>In Toman</FieldDescription>
        <FieldError />
      </Field>,
    );
    const input = screen.getByLabelText("Amount");
    const description = screen.getByText("In Toman");
    expect(input).toHaveAttribute("aria-describedby", description.id);
    expect(input).not.toHaveAttribute("aria-invalid");

    rerender(
      <Field>
        <FieldLabel>Amount</FieldLabel>
        <Input />
        <FieldDescription>In Toman</FieldDescription>
        <FieldError>Numbers only</FieldError>
      </Field>,
    );
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "true"));
    expect(input).toHaveAccessibleDescription("In Toman Numbers only");
    const error = screen.getByText("Numbers only").closest("p")!;
    expect(error).toHaveAttribute("aria-live", "polite");
  });

  it("keeps an empty error region mounted but unlinked", () => {
    renderWithProviders(
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input />
        <FieldError>{undefined}</FieldError>
      </Field>,
    );
    expect(screen.getByLabelText("Title")).not.toHaveAttribute("aria-describedby");
    expect(document.querySelector("[aria-live=polite]")).toBeEmptyDOMElement();
  });

  it("marks required fields visually and with aria-required", () => {
    renderWithProviders(
      <Field required>
        <FieldLabel>Title</FieldLabel>
        <Input />
      </Field>,
    );
    const input = screen.getByRole("textbox", { name: "Title" });
    expect(input).toHaveAttribute("aria-required", "true");
    expect(screen.getByText(/Required/)).toHaveAttribute("aria-hidden", "true");
  });

  it("speaks the optional marker and shows a hint", () => {
    renderWithProviders(
      <Field>
        <FieldLabel marker="optional" hint="Toman">
          Amount
        </FieldLabel>
        <Input />
      </Field>,
    );
    expect(screen.getByRole("textbox", { name: /Amount.*Toman.*Optional/ })).toBeInTheDocument();
  });

  it("propagates disabled and an explicit control id", () => {
    renderWithProviders(
      <Field disabled controlId="workspace">
        <FieldLabel>Workspace</FieldLabel>
        <Input defaultValue="Euroly" />
      </Field>,
    );
    const input = screen.getByLabelText("Workspace");
    expect(input).toHaveAttribute("id", "workspace");
    expect(input).toBeDisabled();
  });

  it("uses Persian marker text", () => {
    renderWithProviders(
      <Field>
        <FieldLabel marker="optional">یادداشت</FieldLabel>
        <Input />
      </Field>,
      { preferences: { locale: "fa", direction: "rtl", digits: "fa" } },
    );
    expect(screen.getByText(/اختیاری/)).toBeInTheDocument();
  });
});

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  priority: z.string().min(1, "Pick a priority"),
  agree: z.boolean().refine((value) => value, "Please confirm"),
});

type FormValues = z.infer<typeof schema>;

function TaskForm({ onValid }: { onValid: (values: FormValues) => void }) {
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", priority: "", agree: false },
  });
  const { errors } = formState;
  return (
    <form noValidate onSubmit={handleSubmit(onValid)}>
      <FormErrorSummary errors={fieldErrorsToSummary(errors)} focusKey={formState.submitCount} />
      <Field controlId="title" required>
        <FieldLabel>Task name</FieldLabel>
        <Input {...register("title")} />
        <FieldError>{errors.title?.message}</FieldError>
      </Field>
      <Field controlId="priority">
        <FieldLabel>Priority</FieldLabel>
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <Select
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
            >
              <SelectItem value="urgent" dotClassName="bg-danger">
                Urgent
              </SelectItem>
              <SelectItem value="high" dotClassName="bg-warning">
                High
              </SelectItem>
            </Select>
          )}
        />
        <FieldError>{errors.priority?.message}</FieldError>
      </Field>
      <Field controlId="agree">
        <Controller
          control={control}
          name="agree"
          render={({ field }) => (
            <Checkbox
              label="I checked the budget"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
              ref={field.ref}
            />
          )}
        />
        <FieldError>{errors.agree?.message}</FieldError>
      </Field>
      <Button type="submit">Save</Button>
    </form>
  );
}

describe("react-hook-form + zod integration", () => {
  it("shows messages, sets aria-invalid and recovers once fixed", async () => {
    const user = userEvent.setup();
    const onValid = vi.fn();
    renderWithProviders(<TaskForm onValid={onValid} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    const summary = await screen.findByRole("region", { name: "Please fix the following" });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(summary).toHaveTextContent("Title is required");

    const title = screen.getByRole("textbox", { name: /Task name/ });
    const priority = screen.getByRole("combobox", { name: "Priority" });
    const agree = screen.getByRole("checkbox", { name: "I checked the budget" });
    await waitFor(() => expect(title).toHaveAttribute("aria-invalid", "true"));
    expect(priority).toHaveAttribute("aria-invalid", "true");
    expect(agree).toHaveAttribute("aria-invalid", "true");
    expect(title).toHaveAccessibleDescription(/Title is required/);
    expect(priority).toHaveAccessibleDescription(/Pick a priority/);

    // Summary links jump to their field.
    await user.click(screen.getByRole("link", { name: "Title is required" }));
    expect(title).toHaveFocus();

    await user.type(title, "Review expenses");
    priority.focus();
    await user.keyboard("{Enter}");
    const option = await screen.findByRole("option", { name: "High" });
    act(() => option.focus());
    await user.keyboard("{Enter}");
    await waitFor(() => expect(priority).toHaveTextContent("High"));
    await user.click(agree);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(onValid).toHaveBeenCalledWith(
        { title: "Review expenses", priority: "high", agree: true },
        expect.anything(),
      ),
    );
    expect(title).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("region", { name: "Please fix the following" })).not.toBeInTheDocument();
  });
});
