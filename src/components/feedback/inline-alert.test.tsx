import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { InlineAlert, InlineAlertAction } from "./inline-alert";

describe("InlineAlert", () => {
  it("uses role=status for warnings with an icon, title and description", () => {
    renderWithProviders(
      <InlineAlert tone="warning" title="Over capacity" description="Today has 9h planned for 8h of capacity." />,
    );
    const alert = screen.getByRole("status");
    expect(alert).toHaveTextContent("Over capacity");
    expect(alert).toHaveTextContent("Today has 9h planned for 8h of capacity.");
    expect(alert).toHaveClass("bg-warning-soft");
    // Never colour alone: an icon accompanies the tone.
    expect(alert.querySelector("svg")).not.toBeNull();
  });

  it("uses role=alert for danger and runs its action", async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    renderWithProviders(
      <InlineAlert
        tone="danger"
        title="Couldn’t save expense"
        description="You’re offline. We’ll retry when you reconnect."
        action={<InlineAlertAction onClick={onRetry}>Retry now</InlineAlertAction>}
      />,
    );
    expect(screen.getByRole("alert")).toHaveClass("bg-danger-soft");
    await user.click(screen.getByRole("button", { name: "Retry now" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("can be urgent without the danger tone", () => {
    renderWithProviders(<InlineAlert tone="info" urgent title="Session ending" />);
    expect(screen.getByRole("alert")).toHaveClass("bg-info-soft");
  });

  it("renders success and disabled actions", () => {
    renderWithProviders(
      <InlineAlert tone="success" title="Saved" action={<InlineAlertAction disabled>Undo</InlineAlertAction>} />,
    );
    expect(screen.getByRole("status")).toHaveClass("bg-success-soft");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });
});
