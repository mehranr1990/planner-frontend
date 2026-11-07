import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { SchedulePreviewDialog } from "./schedule-preview-dialog";

describe("SchedulePreviewDialog", () => {
  it("Members get only “Move only this task”; the cascade is shown disabled with the reason", async () => {
    renderWithProviders(
      <SchedulePreviewDialog
        projectId="website-redesign"
        change={{ itemId: "checkout-flow", start: "2026-10-18", end: "2026-10-20" }}
        title="Checkout flow"
        canCascade={false}
        onClose={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog", { name: /^Preview: move “Checkout flow” \+5 days$/ });
    const cascade = await within(dialog).findByRole("radio", { name: /Move dependent tasks too/ });
    expect(cascade).toBeDisabled();
    expect(within(dialog).getByText("Manager+ can move dependent tasks")).toBeInTheDocument();
    expect(within(dialog).getByRole("radio", { name: /Move only this task/ })).toBeChecked();
    expect(within(dialog).getByRole("button", { name: "Apply 1 changes" })).toBeEnabled();
  });

  it("Manager+ previews the cascade with the moved tasks", async () => {
    renderWithProviders(
      <SchedulePreviewDialog
        projectId="website-redesign"
        change={{ itemId: "checkout-flow", start: "2026-10-18", end: "2026-10-20" }}
        title="Checkout flow"
        canCascade
        onClose={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByRole("radio", { name: /Move dependent tasks too/ })).toBeChecked();
    expect(within(dialog).getByText(/would move$/)).toBeInTheDocument();
  });
});
